/**
 * 上下文组装器
 *
 * 将多路检索结果组装为可注入 System Prompt 的结构化上下文
 * 支持 token 预算控制、去重、引用信息生成
 */

import type { SearchResult, AssembledContext, ContextSource } from "./types"
import { estimateTokens } from "./chunker"

const DEFAULT_MAX_TOKENS = 4000

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

  // 3. 按 token 预算截断
  const selected: SearchResult[] = []
  let currentTokens = 0
  const headerOverhead = 50 // 每个块的标注文本估算 50 tokens

  for (const result of deduped) {
    const chunkTokens = result.chunk.tokenCount + headerOverhead
    if (currentTokens + chunkTokens > maxTokens) {
      // 如果至少有一个块了，停止
      if (selected.length > 0) break
      // 如果第一个块就超预算，截断内容
      selected.push(result)
      currentTokens += chunkTokens
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

  for (const [filename, fileResults] of grouped) {
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
