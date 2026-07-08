import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { SSEWriter } from "../../lib/sse.js"
import { deletePrefix } from "../../lib/storage.js"
import { userProjectPrefix } from "../../lib/storage.js"
import { isValidProjectId } from "../../lib/validation.js"
import { ingestProject, queryProject, getIndexStatus } from "../../lib/rag/pipeline.js"
import { loadChunksData } from "../../lib/rag/vector-store.js"
import type { RAGConfig } from "../../lib/rag/types.js"

/**
 * RAG API 路由
 *
 * POST /projects/:id/rag — 执行 RAG 操作
 *   action: "index"   — 索引整个项目（SSE 流式进度）
 *   action: "query"   — 执行 RAG 查询
 *   action: "status"  — 获取索引状态
 *   action: "sources" — 获取索引来源详情
 *   action: "delete"  — 删除索引
 *
 * 迁移自 apps/web/app/api/projects/[id]/rag/route.ts。
 *
 * 安全修复：原实现硬编码了一个默认 embedding API key 作为 fallback
 * （"sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua"）。迁移后改为
 * 从环境变量 DEFAULT_EMBEDDING_API_KEY 读取，不再有硬编码兜底。
 * 如果环境变量也未配置且请求未提供 key，index/query action 中的 embedding
 * 调用会因无 key 而失败，但 BM25 降级逻辑仍可正常工作（不需要 embedding key），
 * 这与原实现 key 无效时的降级行为一致。
 */

export default async function ragRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { id: string }
    Body: {
      action?: string
      apiKey?: string
      apiBase?: string
      model?: string
      embeddingModel?: string
      embeddingApiKey?: string
      embeddingApiBase?: string
      rerankModel?: string
      question?: string
      maxContextTokens?: number
      stream?: boolean
      activeFile?: string
    }
  }>("/projects/:id/rag", { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      const { id: projectId } = request.params
      if (!isValidProjectId(projectId)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const project = await requireProject(request, reply, projectId)
      if (!project) return

      const { userId } = getAuthContext(request)
      const {
        action,
        apiKey,
        apiBase,
        model,
        embeddingModel,
        embeddingApiKey,
        embeddingApiBase,
        rerankModel,
        question,
        maxContextTokens,
        stream,
        activeFile,
      } = request.body ?? {}

      // 从环境变量读取默认 embedding API key（替代原来的硬编码 fallback）
      const defaultEmbeddingApiKey = process.env.DEFAULT_EMBEDDING_API_KEY || ""

      switch (action) {
        case "status": {
          const status = await getIndexStatus(userId, projectId)
          return reply.send({ status })
        }

        case "index": {
          // embedding 有内置默认 API Key（从环境变量读取），
          // 不再强制要求用户提供 chat API key 即可构建索引
          const effectiveApiKey = apiKey || embeddingApiKey || defaultEmbeddingApiKey

          const config: RAGConfig = {
            apiKey: effectiveApiKey,
            apiBase: apiBase || "https://api.openai.com/v1",
            chatModel: model || "gpt-4o-mini",
            embeddingModel: embeddingModel || "BAAI/bge-m3",
            embeddingApiKey: embeddingApiKey || defaultEmbeddingApiKey,
            embeddingApiBase: embeddingApiBase || "https://api.siliconflow.cn/v1/embeddings",
            rerankModel: rerankModel || "BAAI/bge-reranker-v2-m3",
            maxContextTokens: maxContextTokens || 12000,
          }

          // 流式模式：通过 SSE 实时推送进度
          if (stream) {
            const sse = new SSEWriter(reply)
            sse.start()

            // SSE 心跳：每 10 秒发送一个心跳事件，防止网关/CDN
            // 因长时间无数据而断开连接（OSS 上传几 MB 的向量数据可能耗时 30s+）
            const heartbeat = setInterval(() => {
              try {
                if (!sse.isClosed) {
                  sse.send({ heartbeat: true })
                }
              } catch {
                // SSE 已关闭，忽略
              }
            }, 10_000)

            try {
              const result = await ingestProject(userId, projectId, config, (msg) => {
                if (!sse.isClosed) {
                  sse.send({ progress: msg })
                }
              })
              // 索引完成，发送最终结果
              sse.send({ done: true, success: true, ...result })
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : "未知错误"
              sse.send({ done: true, success: false, error: message })
            } finally {
              clearInterval(heartbeat)
              sse.done()
            }
            return
          }

          // 非流式模式（后台自动索引等场景）
          const progressMessages: string[] = []
          const result = await ingestProject(userId, projectId, config, (msg) => {
            progressMessages.push(msg)
          })

          return reply.send({
            success: true,
            ...result,
            progress: progressMessages,
          })
        }

        case "query": {
          if (!question) {
            return reply.code(400).send({ error: "缺少查询问题" })
          }

          const queryApiKey = apiKey || embeddingApiKey || defaultEmbeddingApiKey

          const config: RAGConfig = {
            apiKey: queryApiKey,
            apiBase: apiBase || "https://api.openai.com/v1",
            chatModel: model || "gpt-4o-mini",
            embeddingModel: embeddingModel || "BAAI/bge-m3",
            embeddingApiKey: embeddingApiKey || defaultEmbeddingApiKey,
            embeddingApiBase: embeddingApiBase || "https://api.siliconflow.cn/v1/embeddings",
            rerankModel: rerankModel || "BAAI/bge-reranker-v2-m3",
            maxContextTokens: maxContextTokens || 12000,
          }

          const context = await queryProject(userId, projectId, question, config, activeFile)
          return reply.send({ context })
        }

        case "sources": {
          // 返回索引的来源详情：每个文件的分块数和摘要
          const chunks = await loadChunksData(userId, projectId)
          const status = await getIndexStatus(userId, projectId)

          // 按文件分组统计
          const fileMap = new Map<string, { filename: string; fileTitle: string; chunkCount: number; totalTokens: number; headings: string[] }>()
          for (const chunk of chunks) {
            const existing = fileMap.get(chunk.filename)
            if (existing) {
              existing.chunkCount++
              existing.totalTokens += chunk.tokenCount
              for (const h of chunk.headingPath) {
                if (h && !existing.headings.includes(h)) {
                  existing.headings.push(h)
                }
              }
            } else {
              fileMap.set(chunk.filename, {
                filename: chunk.filename,
                fileTitle: chunk.fileTitle,
                chunkCount: 1,
                totalTokens: chunk.tokenCount,
                headings: chunk.headingPath.filter(Boolean),
              })
            }
          }

          return reply.send({
            status,
            files: Array.from(fileMap.values()),
            totalChunks: chunks.length,
            totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
          })
        }

        case "delete": {
          await deletePrefix(`${userProjectPrefix(userId, projectId)}.rag/`)
          return reply.send({ success: true })
        }

        default:
          return reply.code(400).send({ error: `未知操作: ${action}` })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误"
      console.error("[RAG API] Error:", error)
      return reply.code(500).send({ error: `RAG 操作失败: ${message}` })
    }
  })
}
