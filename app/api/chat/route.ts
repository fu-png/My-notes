import { NextRequest } from "next/server"

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

    // Stream the response through
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "无法读取响应流。" })}\n\n`))
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
          return
        }

        let buffer = ""

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith("data: ")) continue

              const data = trimmed.slice(6)
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta
                const content = delta?.content
                const reasoningContent = delta?.reasoning_content || delta?.reasoning
                const finishReason = parsed.choices?.[0]?.finish_reason
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
                if (reasoningContent) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning: reasoningContent })}\n\n`))
                }
                if (finishReason) {
                  console.log(`[Chat API] Stream finish_reason: ${finishReason}`)
                  // Forward finish_reason to client so it can detect truncation
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ finish_reason: finishReason })}\n\n`))
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }

          // Process remaining buffer
          if (buffer.trim()) {
            const trimmed = buffer.trim()
            if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
              try {
                const parsed = JSON.parse(trimmed.slice(6))
                const delta = parsed.choices?.[0]?.delta
                const content = delta?.content
                const reasoningContent = delta?.reasoning_content || delta?.reasoning
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
                if (reasoningContent) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning: reasoningContent })}\n\n`))
                }
              } catch {
                // Skip
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "流式读取失败"
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
        } finally {
          controller.close()
          reader.releaseLock()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误"
    return new Response(
      JSON.stringify({ error: `请求异常: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
