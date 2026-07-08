/**
 * Deep Research 路由
 *
 * POST /deep-research         — 提交深度研究任务（立即返回 projectId + jobId）
 * GET  /deep-research/subscribe — SSE 订阅任务实时进度
 *
 * 迁移自：
 * - apps/web/app/api/deep-research/route.ts
 * - apps/web/app/api/deep-research/subscribe/route.ts
 */

import type { FastifyInstance } from "fastify"
import { getAuthContext } from "../../lib/auth-context.js"
import { SSEWriter } from "../../lib/sse.js"
import { createProject } from "../../lib/storage.js"
import {
  createInitialState,
  type SSEEvent,
  type ResearchStepDetail,
} from "./types.js"
import { buildDeepResearchGraph } from "./graph.js"
import {
  createJob,
  getJob,
  subscribe,
  pushEvent,
  completeJob,
  errorJob,
  cleanupOldJobs,
} from "./job-store.js"

// ─── 节点名 → 阶段描述 + 进度百分比 ─────────────────────────────
const NODE_PROGRESS: Record<
  string,
  { phase: string; step: string; progress: number; agentLabel: string }
> = {
  plan: {
    phase: "plan",
    step: "正在规划学习路径…",
    progress: 10,
    agentLabel: "规划智能体",
  },
  search: {
    phase: "search",
    step: "正在搜索相关资料…",
    progress: 30,
    agentLabel: "搜索智能体",
  },
  reflect: {
    phase: "reflect",
    step: "正在评估知识覆盖度…",
    progress: 50,
    agentLabel: "评估智能体",
  },
  synthesize: {
    phase: "synthesize",
    step: "正在整合生成笔记…",
    progress: 75,
    agentLabel: "生成智能体",
  },
  save: {
    phase: "save",
    step: "正在保存学习笔记…",
    progress: 90,
    agentLabel: "保存智能体",
  },
}

/** 从节点输出中提取执行详情 */
function extractDetail(
  nodeName: string,
  nodeOutput: Record<string, unknown>,
  searchCount: number
): ResearchStepDetail {
  const progressInfo = NODE_PROGRESS[nodeName]
  const base: ResearchStepDetail = {
    agent: nodeName,
    agentLabel: progressInfo?.agentLabel || nodeName,
  }

  switch (nodeName) {
    case "plan": {
      const subQuestions = nodeOutput.subQuestions as
        | { question: string }[]
        | undefined
      const learningPath = nodeOutput.learningPath as
        | { stage: string; topics: string[] }[]
        | undefined
      return {
        ...base,
        summary: `已规划 ${learningPath?.length || 0} 个学习阶段，拆解为 ${subQuestions?.length || 0} 个子问题`,
        subQuestions: subQuestions?.map((q) => q.question) || [],
        learningPath:
          learningPath?.map((p) => ({ stage: p.stage, topics: p.topics })) ||
          [],
      }
    }
    case "search": {
      const sources = nodeOutput.sources as
        | { url: string; title: string }[]
        | undefined
      const searchResults = nodeOutput.searchResults as unknown[] | undefined
      return {
        ...base,
        summary: `第 ${searchCount} 轮搜索，找到 ${searchResults?.length || 0} 条结果，${sources?.length || 0} 个来源`,
        sources:
          sources?.slice(0, 8).map((s) => ({ url: s.url, title: s.title })) ||
          [],
        searchRound: searchCount,
      }
    }
    case "reflect": {
      const coverage = nodeOutput.coverage as number | undefined
      const knowledgeGaps = nodeOutput.knowledgeGaps as string[] | undefined
      const isSufficient = nodeOutput.isSufficient as boolean | undefined
      return {
        ...base,
        summary: isSufficient
          ? `知识覆盖度 ${Math.round((coverage || 0) * 100)}%，已满足要求`
          : `知识覆盖度 ${Math.round((coverage || 0) * 100)}%，发现 ${knowledgeGaps?.length || 0} 个知识盲区`,
        coverage,
        knowledgeGaps: knowledgeGaps || [],
        isSufficient: isSufficient || false,
      }
    }
    case "synthesize": {
      const docs = nodeOutput.synthesizedDocs as
        | { title: string }[]
        | undefined
      return {
        ...base,
        summary: `已生成 ${docs?.length || 0} 篇学习笔记`,
        docTitles: docs?.map((d) => d.title) || [],
      }
    }
    case "save": {
      const fileCount = nodeOutput.savedFileCount as number | undefined
      const streaming = nodeOutput.streaming as
        | { currentStep?: string }
        | undefined
      return {
        ...base,
        summary:
          streaming?.currentStep || `已保存 ${fileCount || 0} 篇笔记到项目`,
        savedFileCount: fileCount || 0,
      }
    }
    default:
      return base
  }
}

/** 后台运行 Deep Research 图 */
async function runResearch(
  jobId: string,
  initialState: ReturnType<typeof createInitialState>
) {
  const app = buildDeepResearchGraph()
  let searchCount = 0
  let finalState: Record<string, unknown> = {}

  // 发送初始进度
  pushEvent(jobId, {
    type: "progress",
    phase: "plan",
    step: "正在启动深度研究…",
    progress: 5,
    detail: {
      agent: "supervisor",
      agentLabel: "调度智能体",
      summary: "正在初始化研究流程，准备启动各阶段智能体…",
    },
  })

  const resultStream = await app.stream(initialState, {
    recursionLimit: 25,
    streamMode: "updates" as const,
  })

  for await (const update of resultStream) {
    const nodeNames = Object.keys(update) as (keyof typeof update)[]
    for (const nodeName of nodeNames) {
      const nodeOutput = update[nodeName] as Record<string, unknown>
      Object.assign(finalState, nodeOutput)

      const progressInfo = NODE_PROGRESS[nodeName as string]
      if (progressInfo) {
        let step = progressInfo.step
        let progress = progressInfo.progress

        if (nodeName === "search") {
          searchCount++
          if (searchCount > 1) {
            step = `第 ${searchCount} 轮搜索，补充知识盲区…`
            progress = Math.min(30 + searchCount * 5, 55)
          }
        }

        if (nodeName === "reflect" && nodeOutput.isSufficient) {
          step = "知识覆盖充分，准备生成笔记…"
          progress = 65
        }

        // 如果是 synthesize 节点，从 streaming 中获取更详细的信息
        if (nodeName === "synthesize" && nodeOutput.streaming) {
          const streaming = nodeOutput.streaming as {
            currentStep?: string
          }
          if (streaming.currentStep) {
            step = streaming.currentStep
          }
        }

        // 提取该节点的详细执行信息
        const detail = extractDetail(
          nodeName as string,
          nodeOutput,
          searchCount
        )

        pushEvent(jobId, {
          type: "progress",
          phase: progressInfo.phase as
            | "plan"
            | "search"
            | "reflect"
            | "synthesize"
            | "save",
          step,
          progress,
          detail,
        })
      }
    }
  }

  // 完成
  pushEvent(jobId, {
    type: "complete",
    projectId: finalState.savedProjectId as string,
    fileCount: finalState.savedFileCount as number,
    message: `研究完成！已创建 ${finalState.savedFileCount || 0} 篇学习笔记`,
  })
  completeJob(jobId)
}

// ─── 路由注册 ────────────────────────────────────────────────────

export default async function deepResearchRoutes(fastify: FastifyInstance) {
  /**
   * POST /deep-research — 提交深度研究任务
   * 立即返回 { projectId, jobId }，后台异步运行研究流程
   */
  fastify.post<{
    Body: {
      query?: string
      apiKey?: string
      apiBase?: string
      model?: string
    }
  }>(
    "/deep-research",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const { query, apiKey, apiBase, model } = request.body ?? {}

        if (!query) {
          return reply.code(400).send({ error: "请输入要研究的方向" })
        }

        if (!apiKey) {
          return reply.code(400).send({ error: "未配置 API Key" })
        }

        const { userId } = getAuthContext(request)

        // 清理旧任务
        cleanupOldJobs()

        // 立即创建项目（按 userId 隔离）
        const projectName = `${query.slice(0, 30)} - 深度研究`
        const project = await createProject(userId, projectName)
        const projectId = project.id

        // 创建研究任务（含 userId）
        const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        createJob(jobId, projectId, query, userId)

        // 初始化状态（含 userId）
        const initialState = createInitialState(query, {
          apiKey,
          apiBase: apiBase || "https://api.openai.com/v1",
          model: model || "gpt-4o-mini",
          projectId,
          userId,
        })

        // 后台异步运行研究流程
        runResearch(jobId, initialState).catch((err) => {
          console.error("[Deep Research] 后台任务失败:", err)
          errorJob(
            jobId,
            err instanceof Error ? err.message : "未知错误"
          )
        })

        // 立即返回 projectId 和 jobId，前端马上跳转
        return reply.send({ projectId, jobId })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "未知错误"
        return reply
          .code(500)
          .send({ error: `请求异常: ${message}` })
      }
    }
  )

  /**
   * GET /deep-research/subscribe?jobId=xxx — SSE 订阅任务实时进度
   *
   * 先重放已有的 job.events，再订阅后续事件。
   * 客户端断开时自动清理订阅。
   */
  fastify.get<{
    Querystring: { jobId?: string }
  }>(
    "/deep-research/subscribe",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { jobId } = request.query

      if (!jobId) {
        return reply.code(400).send({ error: "缺少 jobId 参数" })
      }

      const { userId } = getAuthContext(request)

      const job = getJob(jobId)
      if (!job || job.userId !== userId) {
        // 统一返回 404 避免信息泄露（参照 auth-context.ts requireProject 的设计）
        return reply.code(404).send({ error: "任务不存在或已过期" })
      }

      const sse = new SSEWriter(reply)
      sse.start()

      // 1. 先重放已有的事件（重连/延迟订阅场景）
      for (const event of job.events) {
        sse.send(event as unknown as Record<string, unknown>)
      }

      // 2. 如果任务已经结束，直接关闭
      if (job.status === "completed" || job.status === "error") {
        sse.done()
        return
      }

      // 3. 订阅后续事件
      const unsubscribe = subscribe(jobId, (event: SSEEvent) => {
        if (sse.isClosed) {
          unsubscribe()
          return
        }
        sse.send(event as unknown as Record<string, unknown>)
        if (event.type === "complete" || event.type === "error") {
          sse.done()
          unsubscribe()
        }
      })

      // 4. 客户端断开连接时清理订阅
      reply.raw.on("close", () => {
        unsubscribe()
        if (!sse.isClosed) {
          sse.close()
        }
      })
    }
  )
}
