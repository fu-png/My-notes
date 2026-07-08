/**
 * 聊天记录持久化 API — 存储到阿里云 OSS / 本地文件系统
 *
 * GET  /projects/:id/chat-history  → 读取聊天记录
 * POST /projects/:id/chat-history  → 保存聊天记录
 *
 * 存储路径: users/{userId}/projects/{projectId}/chat-history.json
 */

import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { fileExists, readFile, writeFile } from "../../lib/storage.js"
import { isValidProjectId } from "../../lib/validation.js"

interface ChatMessage {
  role?: unknown
  content?: unknown
  pptMeta?: {
    slideImages?: Record<string, unknown>[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface Conversation {
  id?: unknown
  messages?: ChatMessage[]
  [key: string]: unknown
}

export default async function chatHistoryRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string }; Querystring: { mode?: string } }>(
    "/projects/:id/chat-history",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id: projectId } = request.params
      if (!isValidProjectId(projectId)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, projectId)
      if (!project) return

      const mode = request.query.mode

      try {
        const filePath = `users/${userId}/projects/${projectId}/chat-history.json`
        const exists = await fileExists(filePath)
        if (!exists) {
          return { conversations: [] }
        }

        const content = await readFile(filePath)
        if (!content) return { conversations: [] }
        const conversations: Conversation[] = JSON.parse(content)

        // Summary 模式：只返回对话元信息，不含完整消息内容，大幅减小多对话项目的响应体积
        if (mode === "summary") {
          const summaries = conversations.map((conv) => ({
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0,
            preview:
              Array.isArray(conv.messages) && conv.messages.length > 0
                ? String(conv.messages[0]?.content ?? "").slice(0, 200)
                : "",
          }))
          return { conversations: summaries }
        }

        return { conversations }
      } catch (err) {
        fastify.log.error(err, "[chat-history] GET error")
        return { conversations: [] }
      }
    }
  )

  fastify.post<{ Params: { id: string } }>(
    "/projects/:id/chat-history",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id: projectId } = request.params
      if (!isValidProjectId(projectId)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, projectId)
      if (!project) return

      try {
        const body = request.body as { conversations?: unknown }
        const { conversations } = body

        if (!Array.isArray(conversations)) {
          return reply.code(400).send({ error: "conversations must be an array" })
        }

        const MAX_CONVERSATIONS = 200
        if (conversations.length > MAX_CONVERSATIONS) {
          return reply.code(400).send({ error: `对话数量超出限制（最多 ${MAX_CONVERSATIONS} 个）` })
        }

        const VALID_ROLES = new Set(["user", "assistant", "system"])
        const MAX_MESSAGES_PER_CONV = 500
        for (const conv of conversations as Conversation[]) {
          if (typeof conv !== "object" || conv === null) {
            return reply.code(400).send({ error: "对话格式无效" })
          }
          if (typeof conv.id !== "string" || !conv.id.trim()) {
            return reply.code(400).send({ error: "对话缺少 id 字段" })
          }
          if (Array.isArray(conv.messages)) {
            if (conv.messages.length > MAX_MESSAGES_PER_CONV) {
              return reply
                .code(400)
                .send({ error: `单个对话消息数超出限制（最多 ${MAX_MESSAGES_PER_CONV} 条）` })
            }
            for (const msg of conv.messages) {
              if (typeof msg.role !== "string" || !VALID_ROLES.has(msg.role)) {
                return reply.code(400).send({ error: "消息 role 无效，必须为 user/assistant/system" })
              }
              if (typeof msg.content !== "string") {
                return reply.code(400).send({ error: "消息 content 必须为字符串" })
              }
            }
          }
        }

        // 清理大数据（base64 图片等）再存储
        const cleaned = (conversations as Conversation[]).map((conv) => ({
          ...conv,
          messages: conv.messages?.map((msg) => {
            const pptMeta = msg.pptMeta
            if (!pptMeta?.slideImages) return msg
            return {
              ...msg,
              pptMeta: {
                ...pptMeta,
                slideImages: pptMeta.slideImages.map((img) => ({
                  ...img,
                  url: typeof img.url === "string" && !img.url.startsWith("data:") ? img.url : null,
                })),
              },
            }
          }),
        }))

        const filePath = `users/${userId}/projects/${projectId}/chat-history.json`
        await writeFile(filePath, JSON.stringify(cleaned, null, 2), { contentType: "application/json" })

        return { success: true, count: cleaned.length }
      } catch (err) {
        fastify.log.error(err, "[chat-history] POST error")
        return reply.code(500).send({ error: "保存失败" })
      }
    }
  )
}
