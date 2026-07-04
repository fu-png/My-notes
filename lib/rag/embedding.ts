/**
 * Embedding API 封装
 *
 * 调用用户配置的 OpenAI 兼容 API 的 /embeddings 端点
 * 支持批量 embed 和自动重试
 *
 * 并发策略：多个批次之间互不依赖（各自独立的一批文本 → 一批向量），
 * 因此用有限并发窗口同时发送多个批次请求，而非串行等待，
 * 显著缩短大量文本块时的总索引耗时。并发数上限考虑到大多数
 * OpenAI 兼容服务商的限流策略，避免触发 429 反而更慢。
 */

import type { RAGConfig } from "./types"

/** 简单哈希函数（FNV-1a 变体），用于缓存键生成，避免将完整文本作为 Map key */
function simpleHash(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const RATE_LIMIT_RETRY_DELAY_MS = 3000 // 429 限流专用退避基数（比普通 5xx 更保守）
const BATCH_SIZE = 256 // 每批 256 条（行业通用 100-256，OpenAI 上限 2048；SiliconFlow 无明确 batch 限制）
const MAX_CONCURRENCY = 50 // 同时在途的批次请求数上限（行业通用 20-50，确保所有批次一轮并发完成）
const MAX_TEXT_CHARS = 900 // 单条文本最大字符数（超过则截断，防止超出 embedding 模型 token 限制）

// 查询 embedding 缓存：避免重复 API 调用（相同文本短时间内返回相同结果）
const embeddingCache = new Map<string, { vector: number[]; cachedAt: number }>()
const EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000 // 10 分钟
const EMBEDDING_CACHE_MAX_SIZE = 500 // 扩大缓存：避免多子查询 pipeline 中的频繁驱逐

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
  // 使用哈希代替完整文本作为缓存键，减少内存占用和 Map lookup 开销
  const cacheKey = `${config.embeddingModel || "default"}:${simpleHash(text)}`
  const cached = embeddingCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < EMBEDDING_CACHE_TTL_MS) {
    // LRU 策略：命中时移到末尾（Map 保持插入顺序，末尾为最近使用）
    embeddingCache.delete(cacheKey)
    embeddingCache.set(cacheKey, cached)
    return cached.vector
  }
  const results = await embedBatch([text], config)
  const vector = results[0]
  // 缓存结果，超过上限时清除最旧条目
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_SIZE) {
    const oldestKey = embeddingCache.keys().next().value
    if (oldestKey) embeddingCache.delete(oldestKey)
  }
  embeddingCache.set(cacheKey, { vector, cachedAt: Date.now() })
  return vector
}

/** 批量生成 embedding 向量
 *
 * 内部按 BATCH_SIZE 切分为多个批次，用有限并发窗口（MAX_CONCURRENCY）
 * 同时发送多个批次请求，而非逐批串行等待，大幅缩短总耗时。
 *
 * @param onProgress 可选进度回调，每完成一批调用一次，参数为 (已完成条数, 总条数)
 *                   用于向调用方（如索引流程的 SSE 进度推送）实时上报耗时较长的
 *                   Embedding 阶段进度，避免用户长时间看不到任何反馈。
 *                   由于批次并发执行，完成顺序不保证与批次顺序一致，
 *                   但最终返回结果始终按输入顺序排列。
 */
export async function embedBatch(
  texts: string[],
  config: RAGConfig,
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  if (texts.length === 0) return []

  // [修复] 对超长文本进行截断保护，防止单条文本超出 embedding 模型 token 限制
  const safeTexts = texts.map((t) => t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) : t)

  const total = safeTexts.length
  const allResults: number[][] = new Array(total)

  // 切分批次
  const batches: { start: number; texts: string[] }[] = []
  for (let i = 0; i < safeTexts.length; i += BATCH_SIZE) {
    batches.push({ start: i, texts: safeTexts.slice(i, i + BATCH_SIZE) })
  }

  let completedCount = 0
  let nextBatchIndex = 0

  // 并发窗口 worker：每个 worker 循环从队列中取下一个批次执行，
  // 直到所有批次被消费完。以此实现"最多 MAX_CONCURRENCY 个批次同时在途"。
  async function worker(): Promise<void> {
    while (true) {
      const batchIndex = nextBatchIndex++
      if (batchIndex >= batches.length) return

      const batch = batches[batchIndex]
      try {
        const batchResults = await embedBatchWithRetry(batch.texts, config)
        for (let j = 0; j < batchResults.length; j++) {
          allResults[batch.start + j] = batchResults[j]
        }
      } catch (err) {
        // [修复] 逐批次错误捕获：单个批次失败不终止整个索引流程，
        // 填充零向量作为占位，后续 BM25 仍可检索这些分块
        console.warn(`[embedding] Batch ${batchIndex} failed, filling with zero vectors:`, err)
        for (let j = 0; j < batch.texts.length; j++) {
          allResults[batch.start + j] = [] // 空向量，向量搜索会跳过
        }
      }

      completedCount += batch.texts.length
      onProgress?.(Math.min(completedCount, total), total)
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, batches.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return allResults
}

async function embedBatchWithRetry(
  texts: string[],
  config: RAGConfig
): Promise<number[][]> {
  // 与 chat API（apiBase + /chat/completions）保持一致的拼接逻辑
  const baseUrl = (config.embeddingApiBase || config.apiBase).replace(/\/+$/, "")
  // 如果用户已经填了完整的 embedding 端点（以 /embeddings 结尾），直接用；
  // 否则自动拼接 /embeddings，与 OpenAI 兼容 API 的标准路径一致
  const url = baseUrl.endsWith("/embeddings") ? baseUrl : `${baseUrl}/embeddings`
  const model = config.embeddingModel || "BAAI/bge-large-zh-v1.5"
  const embApiKey = config.embeddingApiKey || config.apiKey

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${embApiKey}`,
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

        // 429 限流：提高并发后更容易触发，用更长的独立退避时间重试，
        // 避免和其他 4xx（配置错误）一样直接失败
        if (response.status === 429) {
          if (attempt < MAX_RETRIES - 1) {
            const delay = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, attempt)
            await new Promise((r) => setTimeout(r, delay))
            continue
          }
          throw new Error(msg)
        }

        // 其他 4xx 错误不重试（配置问题）
        if (response.status >= 400 && response.status < 500) {
          throw new Error(msg)
        }

        // 5xx 重试
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
