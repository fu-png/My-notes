/**
 * LLM 调用工具 — 供 Deep Research 各节点共用
 */

import type { DeepResearchState } from '../types'

interface LLMCallOptions {
  apiKey: string
  apiBase: string
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
}

/** 调用 LLM 并返回完整文本（非流式） */
export async function callLLM(opts: LLMCallOptions): Promise<string> {
  const baseUrl = opts.apiBase.replace(/\/+$/, '')
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: false,
    }),
    signal: AbortSignal.timeout(180000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`LLM 调用失败 (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** 从 state 中提取 LLM 配置 */
export function getLLMConfig(state: DeepResearchState): LLMCallOptions {
  return {
    apiKey: state.apiKey,
    apiBase: state.apiBase,
    model: state.model,
    messages: [],
  }
}
