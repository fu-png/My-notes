/**
 * 重排序器
 *
 * 对混合检索后的候选结果进行二次精排：
 * 1. 取 Top-N 候选 chunk（经过 RRF 融合后）
 * 2. 调用硅基流动 /v1/rerank 专用重排序 API 打分（relevance_score 0-1）
 * 3. 按分数重新排序，过滤低分结果
 *
 * 优先使用专用 rerank 接口（如 BAAI/bge-reranker-v2-m3、Qwen3-Reranker 系列）：
 * 该类接口直接返回结构化的 relevance_score，不需要模型输出 JSON 再解析，
 * 从根本上避免了此前用普通 chat 模型输出 JSON 评分时频繁出现的语法损坏、
 * 解析失败问题（小参数量模型在被要求严格输出 JSON 时非常不稳定）。
 *
 * 如果 rerank API 调用失败（网络错误、模型不支持等），自动降级到
 * 基于 chat 模型 + JSON 解析的兼容方案；再失败则降级返回原始排序。
 */

import type { RAGConfig, SearchResult } from "./types.js"
import { parseRobustJSON } from "./json-parser.js"
import { tokenizeToSet } from "./tokenizer.js"

const MAX_CANDIDATES = 30
const MIN_RELEVANCE = 0.2

function resolveRerankModel(config: RAGConfig): string {
  if (config.rerankModel) return config.rerankModel
  return "BAAI/bge-reranker-v2-m3"
}

interface SiliconFlowRerankResponse {
  results: { index: number; relevance_score: number }[]
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

async function rerankViaAPI(
  question: string,
  candidates: SearchResult[],
  config: RAGConfig
): Promise<RerankResult[] | null> {
  try {
    const rerankApiKey = config.embeddingApiKey || config.apiKey
    const rerankBaseUrl = (config.embeddingApiBase || config.apiBase)
      .replace(/\/+$/, "")
      .replace(/\/embeddings\/?$/, "")
    const documents = candidates.map((r) => {
      const preview = r.chunk.content.slice(0, 1500)
      return `来源: ${r.chunk.fileTitle} > ${r.chunk.headingPath.join(" > ")}\n${preview}`
    })

    const response = await fetch(`${rerankBaseUrl}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rerankApiKey}`,
      },
      body: JSON.stringify({
        model: resolveRerankModel(config),
        query: question,
        documents,
        return_documents: false,
        top_n: candidates.length,
      }),
    })

    if (!response.ok) {
      console.warn(`[reranker] Rerank API HTTP ${response.status}, falling back`)
      return null
    }

    const data = (await response.json()) as SiliconFlowRerankResponse
    if (!Array.isArray(data.results)) {
      console.warn("[reranker] Rerank API returned unexpected shape, falling back")
      return null
    }

    return data.results.map((r) => ({
      id: candidates[r.index]?.chunk.id ?? "",
      score: sigmoid(r.relevance_score),
    })).filter((r) => r.id)
  } catch (err) {
    console.warn("[reranker] Rerank API call failed, falling back:", err)
    return null
  }
}

const RERANK_SYSTEM_PROMPT = `你是一个文档检索重排序专家。给定用户问题和若干文档片段，请对每个片段与问题的相关性打分（0-10 分）。

评分标准：
- 10分：片段直接回答了问题，内容完全相关
- 7-9分：片段包含问题的大部分关键信息
- 4-6分：片段部分相关，提供了一些背景信息
- 1-3分：片段几乎无关

你必须严格按以下 JSON 格式返回，不要有其他任何内容：
{"scores": [{"id": "片段ID", "score": 分数}, ...]}`

interface RerankResult {
  id: string
  score: number
}

async function rerankViaChatModel(
  question: string,
  candidates: SearchResult[],
  config: RAGConfig
): Promise<RerankResult[] | null> {
  try {
    const chunkTexts = candidates.map((r, i) => {
      const preview = r.chunk.content.slice(0, 1500)
      return `[片段${i + 1}] ID: ${r.chunk.id}\n来源: ${r.chunk.fileTitle} > ${r.chunk.headingPath.join(" > ")}\n内容: ${preview}`
    })

    const userMessage = `用户问题：${question}\n\n请对以下 ${candidates.length} 个文档片段打分：\n\n${chunkTexts.join("\n\n")}`

    const baseUrl = config.apiBase.replace(/\/+$/, "")
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages: [
          { role: "system", content: RERANK_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    })

    if (!response.ok) {
      console.warn("[reranker] Chat-model fallback: LLM call failed")
      return null
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) return null

    const scores = parseRerankResponse(content)
    return scores.length > 0 ? scores : null
  } catch (err) {
    console.warn("[reranker] Chat-model fallback error:", err)
    return null
  }
}

export interface RerankOutput {
  results: SearchResult[]
  fallbackReason?: string
}

export async function rerankResults(
  question: string,
  results: SearchResult[],
  config: RAGConfig
): Promise<RerankOutput> {
  if (results.length <= 3) return { results }

  const candidates = results.slice(0, MAX_CANDIDATES)

  let scores = await rerankViaAPI(question, candidates, config)
  let usedFallback = false
  let fallbackReason: string | undefined
  if (!scores) {
    scores = await rerankViaChatModel(question, candidates, config)
    if (scores) {
      usedFallback = true
      fallbackReason = "Reranker API 调用失败，已降级为对话模型重排序"
    }
  }

  if (!scores || scores.length === 0) {
    console.warn("[reranker] All API rerank strategies failed, using local keyword reranker")
    scores = localKeywordRerank(question, candidates)
    usedFallback = true
    fallbackReason = "Reranker 模型不可用，已降级为本地关键词匹配"
  }

  const scoreMap = new Map<string, number>()
  for (const s of scores) {
    scoreMap.set(s.id, s.score)
  }

  const minScore = usedFallback ? 0.5 : MIN_RELEVANCE

  const reranked = candidates
    .map((r) => ({
      result: r,
      llmScore: scoreMap.get(r.chunk.id) ?? 0,
    }))
    .sort((a, b) => b.llmScore - a.llmScore)

  const kept = reranked
    .filter((r) => r.llmScore >= minScore)
    .map((r) => ({
      ...r.result,
      score: usedFallback ? r.llmScore / 10 : r.llmScore,
    }))

  const afterFilter = kept.length >= 5
    ? kept
    : reranked.slice(0, Math.min(8, candidates.length)).map((r) => ({
        ...r.result,
        score: usedFallback ? r.llmScore / 10 : r.llmScore,
      }))

  const finalResults = mmrDiversify(afterFilter, 0.4, afterFilter.length)

  const rerankedIds = new Set(candidates.map((r) => r.chunk.id))
  const remaining = results.filter((r) => !rerankedIds.has(r.chunk.id))

  console.debug(
    `[reranker] (${usedFallback ? "chat-fallback" : "rerank-api"}) Reranked ${candidates.length} candidates, kept ${finalResults.length} after filtering`
  )

  return { results: [...finalResults, ...remaining], fallbackReason }
}

function mmrDiversify(
  results: SearchResult[],
  lambda: number,
  maxResults: number
): SearchResult[] {
  if (results.length <= 1) return results

  const selected: SearchResult[] = []
  const remaining = [...results]
  const fileSelectionCount = new Map<string, number>()
  const maxScore = remaining[0]?.score || 1

  while (selected.length < maxResults && remaining.length > 0) {
    let bestIdx = 0
    let bestMmrScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i]
      const relevance = r.score / maxScore
      const fileCount = fileSelectionCount.get(r.chunk.filename) || 0
      const diversityPenalty = fileCount === 0 ? 0 : Math.min(0.6 + (fileCount - 1) * 0.2, 0.95)
      const mmrScore = lambda * relevance - (1 - lambda) * diversityPenalty

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore
        bestIdx = i
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0]
    selected.push(chosen)
    fileSelectionCount.set(
      chosen.chunk.filename,
      (fileSelectionCount.get(chosen.chunk.filename) || 0) + 1
    )
  }

  return selected
}

function localKeywordRerank(question: string, candidates: SearchResult[]): RerankResult[] {
  const queryTerms: string[] = []
  const cjkMatches = question.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g)
  if (cjkMatches) queryTerms.push(...cjkMatches)
  const enMatches = question.match(/[a-zA-Z][a-zA-Z0-9_]{2,}/g)
  if (enMatches) queryTerms.push(...enMatches.map(t => t.toLowerCase()))
  const numMatches = question.match(/\d[\d,]+/g)
  if (numMatches) queryTerms.push(...numMatches)

  if (queryTerms.length === 0) {
    return candidates.map(r => ({ id: r.chunk.id, score: r.score * 10 }))
  }

  const queryTokens = tokenizeToSet(question)

  const results = candidates.map(r => {
    const chunk = r.chunk
    const contentLower = chunk.content.toLowerCase()
    const headingText = chunk.headingPath.join(" ").toLowerCase()
    const titleText = (chunk.fileTitle || "").toLowerCase()
    const metaText = headingText + " " + titleText

    let score = 0

    let titleMatches = 0
    for (const term of queryTerms) {
      if (metaText.includes(term.toLowerCase())) titleMatches++
    }
    score += Math.min(titleMatches * 1.5, 3)

    let contentHits = 0
    for (const term of queryTerms) {
      if (contentLower.includes(term.toLowerCase())) contentHits++
    }
    const coverage = contentHits / queryTerms.length
    score += coverage * 3

    let totalOccurrences = 0
    for (const term of queryTerms) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
      const matches = contentLower.match(regex)
      if (matches) totalOccurrences += matches.length
    }
    const density = totalOccurrences / Math.max(chunk.content.length / 100, 1)
    score += Math.min(density * 2, 2)

    const chunkTokens = tokenizeToSet(chunk.content.slice(0, 2000))
    let overlap = 0
    for (const t of queryTokens) {
      if (chunkTokens.has(t)) overlap++
    }
    const jaccardLike = queryTokens.size > 0 ? overlap / queryTokens.size : 0
    score += jaccardLike * 2

    score += Math.min(r.score * 25, 1)

    return { id: chunk.id, score: Math.min(score, 10) }
  })

  const idToFilename = new Map<string, string>()
  for (const c of candidates) idToFilename.set(c.chunk.id, c.chunk.filename)

  const fileScores = new Map<string, number[]>()
  for (const r of results) {
    const fn = idToFilename.get(r.id) || ""
    if (!fileScores.has(fn)) fileScores.set(fn, [])
    fileScores.get(fn)!.push(r.score)
  }
  const allScores = results.map(r => r.score).sort((a, b) => b - a)
  const median = allScores[Math.floor(allScores.length / 2)] || 0
  const overrepresentedFiles = new Set<string>()
  for (const [fn, scores] of fileScores) {
    const highScoreCount = scores.filter(s => s >= median).length
    if (highScoreCount >= 4) overrepresentedFiles.add(fn)
  }

  if (overrepresentedFiles.size > 0) {
    for (const r of results) {
      const fn = idToFilename.get(r.id) || ""
      if (overrepresentedFiles.has(fn)) {
        r.score *= 0.7
      }
    }
  }

  return results
}

function parseRerankResponse(content: string): RerankResult[] {
  const parsed = parseRobustJSON(content) as Record<string, unknown> | null
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.scores)) {
    return parsed.scores.map((s: { id: string; score: number }) => ({
      id: String(s.id),
      score: Number(s.score),
    }))
  }

  const pairPattern = /(?:"id"\s*:\s*"([^"]+)"[^}]*?"score"\s*:\s*(\d+(?:\.\d+)?))|(?:"score"\s*:\s*(\d+(?:\.\d+)?)[^}]*?"id"\s*:\s*"([^"]+)")/g
  const salvaged: RerankResult[] = []
  let match: RegExpExecArray | null
  while ((match = pairPattern.exec(content)) !== null) {
    if (match[1] && match[2]) {
      salvaged.push({ id: match[1], score: Number(match[2]) })
    } else if (match[3] && match[4]) {
      salvaged.push({ id: match[4], score: Number(match[3]) })
    }
  }
  if (salvaged.length > 0) {
    console.warn(`[reranker] Salvaged ${salvaged.length} scores from malformed JSON via regex`)
    return salvaged
  }

  return []
}
