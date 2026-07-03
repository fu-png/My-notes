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

    const baseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")
    const chatModel = model || "gpt-4o-mini"

    // 使用 AbortController 设置超时，防止上游 LLM API 无响应时请求挂起
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5 min timeout

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

    // 流式响应中持续重置超时，防止长流式输出被误杀
    // 在流结束时清除超时
    const stream = createSSERelay(response, {
      transform: (event) => {
        return Object.keys(event).length > 0 ? event : null
      },
    })

    // 包装流以在流结束时清除超时
    const wrappedStream = new ReadableStream({
      async start(wrappedController) {
        const reader = stream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
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
