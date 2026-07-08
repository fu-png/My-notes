/**
 * 上下文组装器
 *
 * 将多路检索结果组装为可注入 System Prompt 的结构化上下文
 * 支持 token 预算控制、去重、引用信息生成
 */

import type { SearchResult, AssembledContext, ContextSource } from "./types"
import { tokenizeToSet } from "./tokenizer"

const DEFAULT_MAX_TOKENS = 12000

/**
 * 将检索结果组装为上下文文本
 *
 * 格式：
 * ---
 * [来源 1: 文件名 > 标题路径]
 * 内容...
 *
 * [来源 2: 文件名 > 标题路径]
 * 内容...
 * ---
 */
export function buildContext(
  results: SearchResult[],
  maxTokens: number = DEFAULT_MAX_TOKENS
): AssembledContext {
  if (results.length === 0) {
    return { text: "", sources: [], totalTokens: 0 }
  }

  // 1. 去重（同一个 chunk ID 只保留得分最高的）
  const deduped = deduplicateResults(results)

  // 2. 按得分排序（已经排好了，但去重后可能乱序）
  deduped.sort((a, b) => b.score - a.score)

  // 2.5 近重复去重：去除内容高度相似的 chunk
  // [修复] 阈值从 0.6 提高到 0.75，避免误伤跨文件的互补内容
  // 不同文件讨论相同主题时措辞可能相似（如都描述"工具执行流程"），
  // 但角度和细节不同，0.6 的阈值会将它们当作重复丢弃
  const dedupedSimilar = removeNearDuplicates(deduped, 0.75)

  // 3. 按 token 预算截断，同时保障文件多样性
  //    策略：两轮选取
  //    第一轮：每个文件优先选取1个最高分 chunk（round-robin），确保覆盖面
  //    第二轮：剩余预算按分数贪心填充
  const selected: SearchResult[] = []
  let currentTokens = 0
  const headerOverhead = 50 // 每个块的标注文本估算 50 tokens
  const safeMax = Math.floor(maxTokens * 0.95) // 5% 安全余量

  // 按文件分组，每组内按分数降序
  const fileGrouped = new Map<string, SearchResult[]>()
  for (const result of dedupedSimilar) {
    const fname = result.chunk.filename
    if (!fileGrouped.has(fname)) fileGrouped.set(fname, [])
    fileGrouped.get(fname)!.push(result)
  }

  // 第一轮：每个文件取1个最高分 chunk（round-robin 保证公平）
  const selectedIds = new Set<string>()
  // 按每个文件的最高分排序，优先选高分文件
  const fileEntries = Array.from(fileGrouped.entries())
    .sort((a, b) => b[1][0].score - a[1][0].score)

  for (const [, fileResults] of fileEntries) {
    const best = fileResults[0]
    const chunkTokens = best.chunk.tokenCount + headerOverhead
    if (currentTokens + chunkTokens <= safeMax) {
      selected.push(best)
      selectedIds.add(best.chunk.id)
      currentTokens += chunkTokens
    } else if (selected.length === 0) {
      // 第一个块就超预算，截断内容以适配 token 预算
      const maxChars = Math.max(200, Math.floor((maxTokens - headerOverhead) * 1.5))
      selected.push({
        ...best,
        chunk: {
          ...best.chunk,
          content: best.chunk.content.slice(0, maxChars) + "\n\n[... 内容因长度限制被截断]",
          tokenCount: maxTokens - headerOverhead,
        },
      })
      selectedIds.add(best.chunk.id)
      currentTokens = maxTokens
      break
    }
  }

  // 第二轮：剩余预算按分数贪心填充（跳过已选的）
  // [优化] 限制单个文件最多占用 2 个 chunk（从 5 降到 2）
  // 评测发现综合章节（如"构建你自己的Agent-Harness"）被 reranker 打超高分，
  // 轻松占满 5 个位置，导致 Precision@5 = 0%。降到 2 可以让更多专题章节出现
  const fileChunkCount = new Map<string, number>()
  for (const r of selected) {
    const fname = r.chunk.filename
    fileChunkCount.set(fname, (fileChunkCount.get(fname) || 0) + 1)
  }
  const MAX_CHUNKS_PER_FILE = 2

  for (const result of dedupedSimilar) {
    if (selectedIds.has(result.chunk.id)) continue
    const fname = result.chunk.filename
    if ((fileChunkCount.get(fname) || 0) >= MAX_CHUNKS_PER_FILE) continue
    const chunkTokens = result.chunk.tokenCount + headerOverhead
    if (currentTokens + chunkTokens > safeMax) {
      if (selected.length > 0) continue // 跳过超预算的，尝试后面更小的块
    }
    if (currentTokens + chunkTokens <= safeMax) {
      selected.push(result)
      selectedIds.add(result.chunk.id)
      fileChunkCount.set(fname, (fileChunkCount.get(fname) || 0) + 1)
      currentTokens += chunkTokens
    }
  }

  // 4. 按文件分组，同一文件的块保持原文顺序
  const grouped = groupByFile(selected)

  // 5. 格式化为文本
  const parts: string[] = []
  const sources: ContextSource[] = []
  let sourceIndex = 1

  for (const [, fileResults] of grouped) {
    // 同一文件内的块按行号排序
    fileResults.sort((a, b) => a.chunk.startLine - b.chunk.startLine)

    for (const result of fileResults) {
      const chunk = result.chunk
      const location = chunk.headingPath.length > 0
        ? `${chunk.fileTitle} > ${chunk.headingPath.join(" > ")}`
        : chunk.fileTitle

      parts.push(
        `[来源 ${sourceIndex}: ${location}]\n${chunk.content}`
      )

      sources.push({
        filename: chunk.filename,
        fileTitle: chunk.fileTitle,
        headingPath: chunk.headingPath,
        snippet: chunk.content.slice(0, 100) + (chunk.content.length > 100 ? "..." : ""),
        score: result.score,
      })

      sourceIndex++
    }
  }

  const text = parts.join("\n\n")

  return {
    text,
    sources,
    totalTokens: currentTokens,
  }
}

/** 去重：同一个 chunk ID 只保留得分最高的 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>()
  for (const result of results) {
    const existing = seen.get(result.chunk.id)
    if (!existing || result.score > existing.score) {
      seen.set(result.chunk.id, result)
    }
  }
  return Array.from(seen.values())
}

/** 按文件分组，保持整体排序 */
function groupByFile(results: SearchResult[]): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>()
  // 按出现顺序记录文件名
  const fileOrder: string[] = []

  for (const result of results) {
    const filename = result.chunk.filename
    if (!groups.has(filename)) {
      groups.set(filename, [])
      fileOrder.push(filename)
    }
    groups.get(filename)!.push(result)
  }

  // 按首次出现顺序返回（保持分数排序的意义）
  const ordered = new Map<string, SearchResult[]>()
  for (const f of fileOrder) {
    ordered.set(f, groups.get(f)!)
  }

  return ordered
}

/**
 * 近重复检测：基于词集 Jaccard 相似度
 * 对已按分数排序的结果，保留高分块，去除与之相似度超过阈值的低分块
 */
function removeNearDuplicates(
  results: SearchResult[],
  threshold: number
): SearchResult[] {
  if (results.length <= 1) return results

  // 将文本转为词集（使用统一分词器，确保与 BM25 索引一致）

  const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 && b.size === 0) return 1
    let intersection = 0
    for (const t of a) {
      if (b.has(t)) intersection++
    }
    return intersection / (a.size + b.size - intersection)
  }

  const kept: SearchResult[] = []
  const keptTokenSets: Set<string>[] = []

  for (const result of results) {
    const tokens = tokenizeToSet(result.chunk.content)
    let isDuplicate = false

    for (let ki = 0; ki < keptTokenSets.length; ki++) {
      const existing = keptTokenSets[ki]
      if (jaccard(tokens, existing) > threshold) {
        isDuplicate = true
        break
      }
    }
    if (!isDuplicate) {
      kept.push(result)
      keptTokenSets.push(tokens)
    }
    // 早退出优化：当已保留的块超过 30 个时，停止 Jaccard 比较（O(n²) → 有界）
    if (keptTokenSets.length >= 30) break
  }

  return kept
}
