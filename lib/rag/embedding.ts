/**
 * Embedding API 封装
 *
 * 调用用户配置的 OpenAI 兼容 API 的 /embeddings 端点
 * 支持批量 embed 和自动重试
 */

import type { RAGConfig } from "./types"

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const BATCH_SIZE = 50 // 每批最多 50 条

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[]
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

/** 生成单条文本的 embedding 向量 */
export async function embed(
  text: string,
  config: RAGConfig
): Promise<number[]> {
  const results = await embedBatch([text], config)
  return results[0]
}

/** 批量生成 embedding 向量 */
export async function embedBatch(
  texts: string[],
  config: RAGConfig
): Promise<number[][]> {
  if (texts.length === 0) return []

  const allResults: number[][] = new Array(texts.length)

  // 分批处理
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const batchResults = await embedBatchWithRetry(batch, config)

    for (let j = 0; j < batchResults.length; j++) {
      allResults[i + j] = batchResults[j]
    }
  }

  return allResults
}

async function embedBatchWithRetry(
  texts: string[],
  config: RAGConfig
): Promise<number[][]> {
  const baseUrl = config.apiBase.replace(/\/+$/, "")
  const model = config.embeddingModel || "text-embedding-3-small"

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: texts,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const msg =
          (error as Record<string, Record<string, string>>)?.error?.message ||
          `Embedding API error: ${response.status}`

        // 4xx 错误不重试（配置问题）
        if (response.status >= 400 && response.status < 500) {
          throw new Error(msg)
        }

        // 5xx / 429 重试
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        throw new Error(msg)
      }

      const data = (await response.json()) as EmbeddingResponse

      // 按 index 排序确保顺序正确
      const sorted = data.data.sort((a, b) => a.index - b.index)
      return sorted.map((d) => d.embedding)
    } catch (err) {
      if (attempt >= MAX_RETRIES - 1) throw err
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw new Error("Embedding failed after max retries")
}
