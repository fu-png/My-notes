/**
 * SSE 流式处理工具
 *
 * 统一的 Server-Sent Events 流处理，消除项目中 5+ 处重复的 SSE 解析代码
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** The raw parsed JSON object from an SSE data field */
export interface SSEEvent {
  [key: string]: unknown
}

/** Result returned by streamLLMResponse after the stream completes */
export interface LLMStreamResult {
  content: string
  reasoning: string
}

/** Options for streamLLMResponse */
export interface LLMStreamOptions {
  /** Called whenever accumulated content updates */
  onContent?: (accumulated: string) => void
  /** Called whenever accumulated reasoning updates */
  onReasoning?: (accumulated: string) => void
  /** Called on each raw parsed SSE event (for custom handling) */
  onEvent?: (event: SSEEvent) => void
  /** Called if an error field is found in the event */
  onError?: (error: string) => void
}

// ─── parseSSEStream ──────────────────────────────────────────────────────────

/**
 * Async generator that yields parsed SSE events from a ReadableStreamDefaultReader.
 *
 * - Handles buffering of incomplete lines across chunks
 * - Skips empty lines and "[DONE]" markers
 * - Yields parsed JSON objects from "data: " prefixed lines
 * - Silently skips malformed JSON
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent, void, undefined> {
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const event = parseLine(line)
      if (event) yield event
    }
  }

  // Process any remaining data in the buffer
  if (buffer.trim()) {
    const event = parseLine(buffer)
    if (event) yield event
  }
}

// ─── readSSEStream ───────────────────────────────────────────────────────────

/**
 * Higher-level helper that takes a fetch Response and calls a callback for each
 * parsed SSE event.
 *
 * - Validates response.ok and response.body
 * - Returns the reader for external abort support (call reader.cancel())
 *
 * @throws Error if response is not ok or body is missing
 */
export async function readSSEStream(
  response: Response,
  onEvent: (event: SSEEvent) => void
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error("Response body is missing")
  }

  const reader = response.body.getReader()

  // Process in the background; caller can cancel via the returned reader
  ;(async () => {
    for await (const event of parseSSEStream(reader)) {
      onEvent(event)
    }
  })()

  return reader
}

// ─── streamLLMResponse ───────────────────────────────────────────────────────

/**
 * Specifically for LLM chat/completion SSE streams.
 *
 * - Accumulates content and reasoning from delta chunks
 * - Calls onContent(accumulated) and onReasoning(accumulated) on each update
 * - Handles both `content`/`reasoning` (pre-processed) and
 *   `choices[0].delta.content`/`choices[0].delta.reasoning_content` formats
 * - Returns { content, reasoning } when the stream completes
 *
 * @throws Error if response is not ok or body is missing
 */
export async function streamLLMResponse(
  response: Response,
  options: LLMStreamOptions = {}
): Promise<LLMStreamResult> {
  const { onContent, onReasoning, onEvent, onError } = options

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error("Response body is missing")
  }

  const reader = response.body.getReader()
  let content = ""
  let reasoning = ""

  for await (const event of parseSSEStream(reader)) {
    onEvent?.(event)

    // Extract content - supports pre-processed format (content field at top level)
    // and raw OpenAI format (choices[0].delta.content)
    const contentDelta = extractContentDelta(event)
    if (contentDelta) {
      content += contentDelta
      onContent?.(content)
    }

    // Extract reasoning - supports pre-processed format (reasoning field at top level)
    // and raw OpenAI format (choices[0].delta.reasoning_content or .reasoning)
    const reasoningDelta = extractReasoningDelta(event)
    if (reasoningDelta) {
      reasoning += reasoningDelta
      onReasoning?.(reasoning)
    }

    // Handle error field
    const error = extractError(event)
    if (error) {
      onError?.(error)
      content += `\n⚠️ ${error}`
      onContent?.(content)
    }
  }

  return { content, reasoning }
}

// ─── streamIntoMessage ──────────────────────────────────────────────────────

/**
 * Unified SSE stream consumer that feeds parsed events into a React chat message.
 *
 * Encapsulates the rAF-throttled update loop, reasoning parsing, and content
 * accumulation that was previously duplicated across `streamAI` and `handleGenerate`.
 */
export interface StreamIntoMessageOptions {
  reader: ReadableStreamDefaultReader<Uint8Array>
  msgId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setChatMessages: (updater: (prev: any[]) => any[]) => void
  parseReasoningFromContent: (content: string, existingReasoning: string) => { content: string; reasoning: string }
  rafIdsRef: React.MutableRefObject<Set<number>>
}

export interface StreamIntoMessageResult {
  content: string
  reasoning: string
  finishReason: string
}

// We need the React namespace for the types above; use a type-only import to
// avoid adding a runtime dependency (this file runs on both client and server).
import type React from "react"

export async function streamIntoMessage(opts: StreamIntoMessageOptions): Promise<StreamIntoMessageResult> {
  const { reader, msgId, setChatMessages, parseReasoningFromContent, rafIdsRef } = opts

  let fullContent = ""
  let fullReasoning = ""
  let finishReason = ""
  let rafScheduled = false

  for await (const event of parseSSEStream(reader)) {
    if (typeof event.error === "string") {
      fullContent += `\n⚠️ ${event.error}`
    } else if (typeof event.content === "string") {
      fullContent += event.content
    }
    if (typeof event.reasoning === "string") {
      fullReasoning += event.reasoning
    }
    if (typeof event.finish_reason === "string") {
      finishReason = event.finish_reason as string
    }

    // rAF throttle: limit UI updates to one per animation frame
    if (!rafScheduled) {
      rafScheduled = true
      const snapshot = fullContent
      const reasoningSnapshot = fullReasoning
      const parsed = parseReasoningFromContent(snapshot, reasoningSnapshot)
      const rafId = requestAnimationFrame(() => {
        setChatMessages((prev: Array<{ id: string; content: string; reasoning?: string }>) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: parsed.content, reasoning: parsed.reasoning || undefined }
              : m
          )
        )
        rafScheduled = false
        rafIdsRef.current.delete(rafId)
      })
      rafIdsRef.current.add(rafId)
    }
  }

  return { content: fullContent, reasoning: fullReasoning, finishReason }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Parse a single SSE line into an event object, or return null if the line
 * should be skipped (empty, not a data line, [DONE], or malformed JSON).
 */
function parseLine(line: string): SSEEvent | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith("data: ")) return null

  const data = trimmed.slice(6)
  if (data === "[DONE]") return null

  try {
    return JSON.parse(data) as SSEEvent
  } catch {
    // Log malformed JSON in dev for easier debugging
    if (process.env.NODE_ENV !== "production") {
      console.debug("[SSE] Malformed JSON skipped:", data.slice(0, 200))
    }
    return null
  }
}

/** Extract content delta from an SSE event (supports multiple formats) */
function extractContentDelta(event: SSEEvent): string | null {
  // Pre-processed format: { content: "..." }
  if (typeof event.content === "string") {
    return event.content
  }

  // Raw OpenAI format: { choices: [{ delta: { content: "..." } }] }
  const choices = event.choices as Array<{ delta?: { content?: string } }> | undefined
  const delta = choices?.[0]?.delta
  if (delta && typeof delta.content === "string") {
    return delta.content
  }

  return null
}

/** Extract reasoning delta from an SSE event (supports multiple formats) */
function extractReasoningDelta(event: SSEEvent): string | null {
  // Pre-processed format: { reasoning: "..." }
  if (typeof event.reasoning === "string") {
    return event.reasoning
  }

  // Raw OpenAI format: { choices: [{ delta: { reasoning_content: "..." } }] }
  // Also supports: { choices: [{ delta: { reasoning: "..." } }] }
  const choices = event.choices as Array<{
    delta?: { reasoning_content?: string; reasoning?: string }
  }> | undefined
  const delta = choices?.[0]?.delta
  if (delta) {
    if (typeof delta.reasoning_content === "string") {
      return delta.reasoning_content
    }
    if (typeof delta.reasoning === "string") {
      return delta.reasoning
    }
  }

  return null
}

/** Extract error string from an SSE event */
function extractError(event: SSEEvent): string | null {
  if (typeof event.error === "string") {
    return event.error
  }
  return null
}

// ─── Server-side SSE Relay ──────────────────────────────────────────────────

/**
 * Create a ReadableStream that relays an upstream LLM SSE response to the client.
 *
 * Handles:
 * - Buffered line splitting (incomplete chunks across reads)
 * - JSON parsing of `data: ` lines
 * - Extraction of content, reasoning, finish_reason from OpenAI-format events
 * - Re-encoding as simplified SSE events (`{ content }`, `{ reasoning }`, `{ finish_reason }`)
 * - Proper [DONE] forwarding and stream cleanup
 *
 * Usage in API routes:
 * ```ts
 * const stream = createSSERelay(upstreamResponse)
 * return new Response(stream, {
 *   headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }
 * })
 * ```
 */
export function createSSERelay(
  upstreamResponse: Response,
  options?: {
    /** Additional fields to extract and forward from delta (e.g., ['tool_calls']) */
    extraFields?: string[]
    /** Transform each extracted event before forwarding. Return null to skip. */
    transform?: (event: Record<string, unknown>) => Record<string, unknown> | null
  }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamResponse.body?.getReader()
      if (!reader) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "无法读取上游响应流。" })}\n\n`))
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
        return
      }

      let buffer = ""

      const processLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) return

        const data = trimmed.slice(6)
        if (data === "[DONE]") {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          const finishReason = parsed.choices?.[0]?.finish_reason

          const event: Record<string, unknown> = {}

          if (delta?.content) event.content = delta.content
          if (delta?.reasoning_content || delta?.reasoning) {
            event.reasoning = delta.reasoning_content || delta.reasoning
          }
          if (finishReason) {
            event.finish_reason = finishReason
          }

          // Extract additional fields if specified
          if (options?.extraFields && delta) {
            for (const field of options.extraFields) {
              if (delta[field] !== undefined) {
                event[field] = delta[field]
              }
            }
          }

          // Apply transform if provided, otherwise forward directly
          if (options?.transform) {
            const transformed = options.transform(event)
            if (transformed && Object.keys(transformed).length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(transformed)}\n\n`))
            }
          } else if (Object.keys(event).length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }
        } catch {
          // Log malformed JSON from upstream for debugging
          if (process.env.NODE_ENV !== "production") {
            console.debug("[SSE Relay] Malformed upstream JSON skipped:", data.slice(0, 200))
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            processLine(line)
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          processLine(buffer)
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
}

/** Standard SSE response headers */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const
