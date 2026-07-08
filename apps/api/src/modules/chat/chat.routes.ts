import type { FastifyInstance } from "fastify"
import { SSEWriter, relayUpstreamSSE } from "../../lib/sse.js"

/**
 * AI 对话 API（流式）
 *
 * POST /chat — 通用 LLM 对话，SSE 流式返回
 *
 * 迁移自 apps/web/app/api/chat/route.ts。行为保持一致：
 * - 校验 apiKey / messages（非空、数量上限 200）
 * - 5 分钟保活超时，随流式数据到达自动重置（防止长回答被误杀，
 *   同时避免上游完全无响应时请求无限挂起）
 * - 透传上游 OpenAI 兼容 SSE，重新编码为简化事件格式 { content } / { reasoning } / { finish_reason }
 *
 * 说明：该路由本身不涉及项目归属，无需 requireProject 校验；仅需登录鉴权
 * （fastify.authenticate）即可调用，与原实现在未鉴权网关下"任何人可调用"
 * 相比是安全性上的改进。
 */
export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      messages?: Array<{ role: string; content: string }>
      apiKey?: string
      apiBase?: string
      model?: string
    }
  }>("/chat", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { messages, apiKey, apiBase, model } = request.body ?? {}

    if (!apiKey) {
      return reply.code(400).send({ error: "未配置 API Key，请先在设置中配置。" })
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({ error: "消息内容不能为空。" })
    }

    const MAX_MESSAGES = 200
    if (messages.length > MAX_MESSAGES) {
      return reply.code(400).send({ error: `消息数量超出限制（最多 ${MAX_MESSAGES} 条）` })
    }

    const baseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")
    const chatModel = model || "gpt-4o-mini"

    const controller = new AbortController()

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: chatModel,
          messages,
          temperature: 0.7,
          max_tokens: 32768,
          stream: true,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误"
      return reply.code(500).send({ error: `请求异常: ${msg}` })
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
      const errorMessage =
        errorData?.error?.message || `API 请求失败 (${response.status}): ${response.statusText}`
      return reply.code(response.status).send({ error: errorMessage })
    }

    if (!response.body) {
      return reply.code(502).send({ error: "无法读取上游响应流。" })
    }

    const sse = new SSEWriter(reply)
    sse.start()

    try {
      await relayUpstreamSSE(response.body, sse, {
        transform: (event) => (Object.keys(event).length > 0 ? event : null),
        keepAliveTimeoutMs: 300_000,
        onTimeout: () => controller.abort(),
      })
      sse.done()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "流式读取失败"
      sse.send({ error: msg })
      sse.done()
    }
  })
}
