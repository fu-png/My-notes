import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { SSEWriter, relayUpstreamSSE } from "../../lib/sse.js"
import { listFiles, readFile, userProjectPrefix } from "../../lib/storage.js"
import { isValidProjectId } from "../../lib/validation.js"

/**
 * AI 笔记生成 API（流式）
 *
 * POST /projects/:id/generate — 基于项目所有来源生成结构化笔记
 *   type: "summary"   — 项目摘要
 *   type: "faq"       — 常见问题
 *   type: "guide"     — 学习指南
 *   type: "outline"   — 内容大纲
 *   type: "timeline"  — 时间线
 *   type: "briefing"  — 简报文档
 *
 * 迁移自 apps/web/app/api/projects/[id]/generate/route.ts，逻辑与模板 prompt
 * 保持一致；存储路径改为按 userId 隔离的 users/{userId}/projects/{id}/ 前缀。
 */

const TEMPLATES: Record<string, { name: string; prompt: string }> = {
  summary: {
    name: "项目摘要",
    prompt: `请基于以下所有文档内容，生成一份全面的项目摘要。要求：
1. 首先用 2-3 句话概括项目的核心主题
2. 分主题总结各文档的关键内容
3. 提炼出最重要的 5-8 个核心概念
4. 总结文档之间的关联和整体架构
5. 使用中文，采用 Markdown 格式，适合作为项目总览笔记`,
  },
  faq: {
    name: "常见问题",
    prompt: `请基于以下所有文档内容，生成一份 FAQ（常见问题解答）。要求：
1. 提炼出 8-12 个最可能被问到的问题
2. 问题应覆盖核心概念、使用方法、设计原因、常见误区等
3. 每个回答简洁有力，100-200 字，引用文档中的具体内容
4. 问题从浅到深排列
5. 使用中文，采用 Markdown 格式，每个 Q&A 用 ### 标题分隔`,
  },
  guide: {
    name: "学习指南",
    prompt: `请基于以下所有文档内容，生成一份系统的学习指南。要求：
1. 设计一条由浅入深的学习路径
2. 将内容分为"入门→进阶→深入"三个阶段
3. 每个阶段列出需要理解的关键概念和建议的阅读顺序
4. 标注前置知识要求和难度级别
5. 给出学习建议和实践练习方向
6. 使用中文，采用 Markdown 格式，适合打印或保存为笔记`,
  },
  outline: {
    name: "内容大纲",
    prompt: `请基于以下所有文档内容，生成一份详细的内容大纲。要求：
1. 提取所有文档的标题层级结构
2. 在每个章节/段落下补充 1 行内容摘要
3. 标注各部分之间的逻辑关系（前置依赖、并列、递进等）
4. 统计每个部分的大致篇幅
5. 使用中文，采用 Markdown 多级标题格式`,
  },
  timeline: {
    name: "时间线",
    prompt: `请基于以下所有文档内容，生成一条逻辑时间线或演进路线。要求：
1. 如果文档包含时间信息，按时间顺序排列关键事件
2. 如果没有明确时间，按逻辑演进/因果关系排列
3. 每个节点包括：标题、简要描述（50 字内）、关键意义
4. 标注里程碑事件
5. 使用中文，采用 Markdown 格式，可以用列表或表格`,
  },
  briefing: {
    name: "简报文档",
    prompt: `请基于以下所有文档内容，生成一份精炼的简报文档，适合分享给团队成员快速了解项目。要求：
1. 控制在 500-800 字
2. 结构为：背景 → 核心要点 → 关键发现 → 行动建议
3. 语言精炼、结论导向
4. 使用中文，采用 Markdown 格式`,
  },
}

export default async function generateRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { id: string }
    Body: {
      type?: string
      apiKey?: string
      apiBase?: string
      model?: string
      customPrompt?: string
    }
  }>("/projects/:id/generate", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id: projectId } = request.params
    if (!isValidProjectId(projectId)) {
      return reply.code(400).send({ error: "无效的项目 ID" })
    }

    const project = await requireProject(request, reply, projectId)
    if (!project) return

    const { type, apiKey, apiBase, model, customPrompt } = request.body ?? {}

    if (!apiKey) {
      return reply.code(400).send({ error: "需要 API Key" })
    }

    const template = type ? TEMPLATES[type] : undefined
    if (!template && !customPrompt) {
      return reply.code(400).send({ error: `未知的生成类型: ${type}` })
    }

    const { userId } = getAuthContext(request)
    const projectPrefix = userProjectPrefix(userId, projectId)

    // 1. 读取项目所有文档
    const allFiles = await listFiles(projectPrefix, true)
    const mdFiles = allFiles.filter(
      (f) =>
        !f.pathname.endsWith("/meta.json") &&
        !f.pathname.includes("/.rag/") &&
        (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
    )

    if (mdFiles.length === 0) {
      return reply.code(400).send({ error: "项目中没有可用的文档" })
    }

    // 2. 读取所有文件内容（并行）
    const documentEntries = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await readFile(file.pathname)
        if (content && content.trim().length > 0) {
          const filename = file.pathname.slice(projectPrefix.length)
          return `--- 文档: ${filename} ---\n${content}`
        }
        return null
      })
    )
    const documents = documentEntries.filter((d): d is string => d !== null)

    // 3. 构建 prompt
    const taskPrompt = customPrompt || template!.prompt
    const fullContent = documents.join("\n\n")

    const maxChars = 80000
    const truncatedContent =
      fullContent.length > maxChars ? fullContent.slice(0, maxChars) + "\n\n[...内容已截断...]" : fullContent

    const messages = [
      {
        role: "system",
        content: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。`,
      },
      {
        role: "user",
        content: `${taskPrompt}\n\n以下是项目中的所有文档内容（共 ${mdFiles.length} 个文件）：\n\n${truncatedContent}`,
      },
    ]

    // 4. 流式调用 LLM
    const apiBaseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")

    let res: Response
    try {
      res = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0.3,
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误"
      return reply.code(500).send({ error: `请求异常: ${msg}` })
    }

    const sse = new SSEWriter(reply)

    if (!res.ok) {
      const err = await res.text()
      sse.start()
      sse.send({ error: `API 调用失败: ${res.status} ${err.slice(0, 200)}` })
      sse.done()
      return
    }

    if (!res.body) {
      sse.start()
      sse.send({ error: "无法读取上游响应" })
      sse.done()
      return
    }

    sse.start()
    try {
      await relayUpstreamSSE(res.body, sse)
      sse.done()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误"
      sse.send({ error: msg })
      sse.done()
    }
  })
}
