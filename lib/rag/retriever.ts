/**
 * 混合检索 + RRF 融合
 *
 * 并行执行向量搜索和 BM25 搜索，使用 Reciprocal Rank Fusion 合并结果
 * 返回去重、排序后的 Top-K 结果
 */

import { searchByVector } from "./vector-store"
import { searchByBm25 } from "./bm25-store"
import { embed } from "./embedding"
import type { RAGConfig, SearchResult } from "./types"

// RRF 参数，k=30 增大头部结果区分度
const RRF_K = 30
// 每路检索的候选数量（多取一些，融合后再截断）
const PER_SOURCE_TOP_K = 15

/**
 * Reciprocal Rank Fusion：将多路排序结果融合为一个
 *
 * 公式: score(doc) = Σ 1/(k + rank_i)
 * k=60 时，排名第 1 的得分 ≈ 0.0164，排名第 10 的得分 ≈ 0.0143
 * 多路命中的文档得分叠加，天然偏向被多路同时命中的结果
 */
function rrfFuse(resultSets: SearchResult[][]): SearchResult[] {
  const scoreMap = new Map<string, { score: number; result: SearchResult }>()

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank]
      const rrfScore = 1 / (RRF_K + rank + 1) // rank 从 0 开始，+1 转为 1-based

      const existing = scoreMap.get(r.chunk.id)
      if (existing) {
        existing.score += rrfScore
        // 保留得分更高的那个原始结果作为引用
        if (r.score > existing.result.score) {
          existing.result = { ...r, source: "hybrid" }
        } else {
          existing.result = { ...existing.result, source: "hybrid" }
        }
      } else {
        scoreMap.set(r.chunk.id, {
          score: rrfScore,
          result: r,
        })
      }
    }
  }

  // 按 RRF 综合得分排序
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, result }) => ({
      ...result,
      score, // 使用 RRF 融合后的得分
    }))
}

/**
 * 混合检索：向量搜索 + BM25 搜索 → RRF 融合
 */
export async function hybridSearch(
  projectId: string,
  query: string,
  config: RAGConfig,
  topK: number = 10
): Promise<SearchResult[]> {
  // 并行执行两路检索
  const [queryVector] = await Promise.all([embed(query, config)])

  const [vectorResults, bm25Results] = await Promise.all([
    searchByVector(projectId, queryVector, PER_SOURCE_TOP_K),
    searchByBm25(projectId, query, PER_SOURCE_TOP_K),
  ])

  // RRF 融合
  const fused = rrfFuse([vectorResults, bm25Results])

  return fused.slice(0, topK)
}

/**
 * 多查询混合检索：对多个子查询分别检索，再融合去重
 * 用于查询分解后的并行检索
 */
export async function multiQuerySearch(
  projectId: string,
  queries: string[],
  config: RAGConfig,
  topK: number = 10
): Promise<SearchResult[]> {
  if (queries.length === 0) return []
  if (queries.length === 1) return hybridSearch(projectId, queries[0], config, topK)

  // 并行执行所有子查询的混合检索
  const allResults = await Promise.all(
    queries.map((q) =>
      hybridSearch(projectId, q, config, PER_SOURCE_TOP_K)
    )
  )

  // 再次 RRF 融合所有子查询的结果
  const fused = rrfFuse(allResults)

  return fused.slice(0, topK)
}
