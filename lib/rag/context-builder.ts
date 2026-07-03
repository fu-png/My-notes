/**
 * 上下文组装器
 *
 * 将多路检索结果组装为可注入 System Prompt 的结构化上下文
 * 支持 token 预算控制、去重、引用信息生成
 */

import type { SearchResult, AssembledContext, ContextSource } from "./types"
import { estimateTokens } from "./chunker"

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

  // 2.5 近重复去重：去除内容高度相似的 chunk（Jaccard 相似度 > 0.6）
  const dedupedSimilar = removeNearDuplicates(deduped, 0.6)

  // 3. 按 token 预算截断
  const selected: SearchResult[] = []
  let currentTokens = 0
  const headerOverhead = 50 // 每个块的标注文本估算 50 tokens

  for (const result of dedupedSimilar) {
    const chunkTokens = result.chunk.tokenCount + headerOverhead
    if (currentTokens + chunkTokens > maxTokens) {
      // 如果至少有一个块了，停止
      if (selected.length > 0) break
      // 如果第一个块就超预算，截断内容以适配 token 预算
      // 使用 estimateTokens 函数进行更精确的截断
      const maxChars = Math.max(200, (maxTokens - headerOverhead) * 2) // 保守按 1 token ≈ 2 字符（兼顾中文）
      selected.push({
        ...result,
        chunk: {
          ...result.chunk,
          content: result.chunk.content.slice(0, maxChars) + "\n\n[... 内容因长度限制被截断]",
          tokenCount: maxTokens - headerOverhead,
        },
      })
      currentTokens = maxTokens
      break
    }
    selected.push(result)
    currentTokens += chunkTokens
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
    totalTokens: estimateTokens(text),
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

  // 将文本转为词集（支持中英文混合分词）
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>()
    // 英文词
    const enMatches = text.match(/[a-zA-Z0-9_]+/g)
    if (enMatches) enMatches.forEach((t) => tokens.add(t.toLowerCase()))
    // 中文 bigram
    const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g)
    if (cjkMatches) {
      for (const seg of cjkMatches) {
        for (let i = 0; i < seg.length - 1; i++) {
          tokens.add(seg[i] + seg[i + 1])
        }
      }
    }
    return tokens
  }

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
    const tokens = tokenize(result.chunk.content)
    let isDuplicate = false

    for (const existing of keptTokenSets) {
      if (jaccard(tokens, existing) > threshold) {
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      kept.push(result)
      keptTokenSets.push(tokens)
    }
  }

  return kept
}
