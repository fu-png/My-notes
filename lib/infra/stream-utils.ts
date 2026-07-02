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
