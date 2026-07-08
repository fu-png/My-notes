import { NextRequest } from "next/server"
import { createSSERelay, SSE_HEADERS } from "@/lib/infra/stream-utils"

// Allow long-running streaming responses (reasoning models can take 2+ minutes)
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, apiKey, apiBase, model } = body

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "未配置 API Key，请先在设置中配置。" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "消息内容不能为空。" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // 限制消息数量
    const MAX_MESSAGES = 200
    if (messages.length > MAX_MESSAGES) {
      return Response.json({ error: `消息数量超出限制（最多 ${MAX_MESSAGES} 条）` }, { status: 400 })
    }

    const baseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")
    const chatModel = model || "gpt-4o-mini"

    // 使用 AbortController 设置超时，防止上游 LLM API 无响应时请求挂起
    // [P2 FIX] 超时在流式阶段会随活动数据重置，确保长回答不被误杀
    const controller = new AbortController()
    let timeout = setTimeout(() => controller.abort(), 300000) // 5 min initial timeout

    const response = await fetch(`${baseUrl}/chat/completions`, {
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

    if (!response.ok) {
      clearTimeout(timeout)
      const errorData = await response.json().catch(() => ({}))
      const errorMessage =
        errorData?.error?.message ||
        `API 请求失败 (${response.status}): ${response.statusText}`
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    // 流式代理：透传上游 SSE 并在流活动时重置超时
    const stream = createSSERelay(response, {
      transform: (event) => {
        return Object.keys(event).length > 0 ? event : null
      },
    })

    // [P2 FIX] 包装流以在收到数据时重置超时（防止长回答被误杀），流结束时清除
    const wrappedStream = new ReadableStream({
      async start(wrappedController) {
        const reader = stream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            // Reset timeout on each chunk — keeps long streaming alive
            clearTimeout(timeout)
            timeout = setTimeout(() => controller.abort(), 300000)
            wrappedController.enqueue(value)
          }
        } finally {
          clearTimeout(timeout)
          wrappedController.close()
        }
      },
    })

    return new Response(wrappedStream, { headers: SSE_HEADERS })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误"
    return new Response(
      JSON.stringify({ error: `请求异常: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
