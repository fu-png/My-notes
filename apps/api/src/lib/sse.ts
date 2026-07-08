/**
 * Fastify 版 SSE（Server-Sent Events）流式响应工具
 *
 * 迁移说明：原 Next.js 实现（lib/infra/stream-utils.ts）基于 Web Streams API
 * 的 ReadableStream + Response 模型。Fastify 不使用该模型，而是通过
 * `reply.raw`（底层 Node.js http.ServerResponse）直接写入响应体，因此这里
 * 用一个轻量的 `SSEWriter` 封装取代原来的 ReadableStream/controller 写法，
 * 但保留完全一致的行为：
 * - 统一的 SSE 响应头（Content-Type / Cache-Control / Connection）
 * - `data: {...}\n\n` 格式的事件写入
 * - 上游 OpenAI 兼容 SSE 流的解析（缓冲跨 chunk 的不完整行、解析 data: 行、
 *   跳过 [DONE] 与非法 JSON）
 * - content / reasoning_content(reasoning) / finish_reason 字段提取
 * - 流式期间基于收到数据自动重置超时（保护长回答不被误杀，同时防止上游
 *   完全无响应时请求无限挂起）
 */

import type { FastifyReply } from "fastify"

/** 标准 SSE 响应头 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const

/**
 * 轻量 SSE 写入器，封装 reply.raw 的头部设置与事件写入。
 * 用法：
 * ```ts
 * const sse = new SSEWriter(reply)
 * sse.start()
 * sse.send({ content: "hello" })
 * sse.done()
 * ```
 */
export class SSEWriter {
  private reply: FastifyReply
  private started = false
  private closed = false

  constructor(reply: FastifyReply) {
    this.reply = reply
  }

  /** 写入 SSE 响应头，开始流式响应 */
  start(): void {
    if (this.started) return
    this.started = true
    this.reply.raw.writeHead(200, SSE_HEADERS)
    // 告知 Fastify 我们已手动接管响应，防止其尝试再次写入/序列化
    this.reply.hijack()
  }

  /** 发送一个 SSE data 事件 */
  send(event: Record<string, unknown>): void {
    if (this.closed) return
    if (!this.started) this.start()
    this.reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  /** 发送 [DONE] 标记并结束响应 */
  done(): void {
    if (this.closed) return
    if (!this.started) this.start()
    this.reply.raw.write("data: [DONE]\n\n")
    this.close()
  }

  /** 直接结束响应（不写 [DONE]），用于异常路径 */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.reply.raw.end()
  }

  get isClosed(): boolean {
    return this.closed
  }
}

/** 从上游 OpenAI 兼容 SSE chunk 中解析出的单条事件 */
export interface UpstreamDelta {
  content?: string
  reasoning?: string
  finishReason?: string
  /** 原始 delta 对象，供需要提取额外字段（如 tool_calls）的调用方使用 */
  rawDelta?: Record<string, unknown>
}

/**
 * 解析单行 SSE 文本（data: 前缀），返回原始 JSON 对象；
 * 跳过空行、非 data: 行、[DONE] 标记与非法 JSON。
 */
function parseUpstreamLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith("data: ")) return null
  const data = trimmed.slice(6)
  if (data === "[DONE]") return null
  try {
    return JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 从解析后的上游 JSON 对象中提取 content/reasoning/finish_reason */
function extractDelta(parsed: Record<string, unknown>): UpstreamDelta | null {
  const choices = parsed.choices as Array<{ delta?: Record<string, unknown>; finish_reason?: string }> | undefined
  const delta = choices?.[0]?.delta
  const finishReason = choices?.[0]?.finish_reason

  const result: UpstreamDelta = {}
  if (delta && typeof delta.content === "string") result.content = delta.content
  if (delta && (typeof delta.reasoning_content === "string" || typeof delta.reasoning === "string")) {
    result.reasoning = (delta.reasoning_content as string) || (delta.reasoning as string)
  }
  if (typeof finishReason === "string") result.finishReason = finishReason
  if (delta) result.rawDelta = delta

  if (result.content === undefined && result.reasoning === undefined && result.finishReason === undefined) {
    return null
  }
  return result
}

/**
 * 逐行消费一个 Node.js 可读流（通常来自 undici/fetch Response.body），
 * 按 SSE 格式缓冲跨 chunk 的不完整行，对每一行调用 onLine。
 */
async function consumeLines(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  onLine: (line: string) => void
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ""

  // fetch()（undici）在 Node 中返回的是 Web ReadableStream，优先按其处理
  if (typeof (body as ReadableStream<Uint8Array>).getReader === "function") {
    const reader = (body as ReadableStream<Uint8Array>).getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) onLine(line)
    }
  } else {
    // Node.js Readable 兜底路径
    for await (const chunk of body as NodeJS.ReadableStream) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) onLine(line)
    }
  }

  if (buffer.trim()) onLine(buffer)
}

export interface RelayUpstreamSSEOptions {
  /** 每收到一条上游事件（提取后）时的回调，可用于转发前的自定义处理/转换。返回 null 跳过转发 */
  transform?: (event: Record<string, unknown>) => Record<string, unknown> | null
  /** 每条 content delta 到达时回调（用于累积 fullContent 等场景） */
  onContent?: (delta: string, accumulated: string) => void
  /** 每条 reasoning delta 到达时回调 */
  onReasoning?: (delta: string, accumulated: string) => void
  /** 流正常结束（含 [DONE]）后回调，可用于发送汇总事件（如解析出的 JSON outline）等 */
  onComplete?: (result: { content: string; reasoning: string }) => void | Promise<void>
  /** 保活超时（毫秒），每次收到 chunk 会重置。默认 300000（5 分钟），与原 Next.js 实现一致 */
  keepAliveTimeoutMs?: number
  /** 超时后调用（用于中止底层请求），一般传入 AbortController.abort */
  onTimeout?: () => void
}

/**
 * 将上游 OpenAI 兼容 SSE Response 透传给 sse writer，并在流活跃期间重置保活超时。
 * 对应原 Next.js `createSSERelay` + chat/route.ts 中的超时重置包装逻辑。
 */
export async function relayUpstreamSSE(
  upstreamBody: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  sse: SSEWriter,
  options: RelayUpstreamSSEOptions = {}
): Promise<{ content: string; reasoning: string }> {
  const { transform, onContent, onReasoning, keepAliveTimeoutMs = 300_000, onTimeout } = options

  let content = ""
  let reasoning = ""

  let timeout: ReturnType<typeof setTimeout> | undefined
  const resetTimeout = () => {
    if (!onTimeout) return
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(onTimeout, keepAliveTimeoutMs)
  }
  resetTimeout()

  try {
    await consumeLines(upstreamBody, (line) => {
      resetTimeout()
      const parsed = parseUpstreamLine(line)
      if (!parsed) return

      const delta = extractDelta(parsed)
      if (!delta) return

      if (delta.content) {
        content += delta.content
        onContent?.(delta.content, content)
      }
      if (delta.reasoning) {
        reasoning += delta.reasoning
        onReasoning?.(delta.reasoning, reasoning)
      }

      const event: Record<string, unknown> = {}
      if (delta.content) event.content = delta.content
      if (delta.reasoning) event.reasoning = delta.reasoning
      if (delta.finishReason) event.finish_reason = delta.finishReason

      if (Object.keys(event).length === 0) return

      if (transform) {
        const transformed = transform(event)
        if (transformed && Object.keys(transformed).length > 0) {
          sse.send(transformed)
        }
      } else {
        sse.send(event)
      }
    })
  } finally {
    if (timeout) clearTimeout(timeout)
  }

  await options.onComplete?.({ content, reasoning })

  return { content, reasoning }
}
