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

    // Use AbortController with generous timeout for reasoning models
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

    clearTimeout(timeout)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage =
        errorData?.error?.message ||
        `API 请求失败 (${response.status}): ${response.statusText}`
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    // Stream the response through — relay upstream SSE with finish_reason logging
    const stream = createSSERelay(response, {
      transform: (event) => {
        if (event.finish_reason) {
          console.log(`[Chat API] Stream finish_reason: ${event.finish_reason}`)
        }
        return Object.keys(event).length > 0 ? event : null
      },
    })

    return new Response(stream, { headers: SSE_HEADERS })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误"
    return new Response(
      JSON.stringify({ error: `请求异常: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
