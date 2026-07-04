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

import type { RAGConfig, SearchResult } from "./types"
import { parseRobustJSON } from "./json-parser"
import { tokenizeToSet } from "./tokenizer"

const MAX_CANDIDATES = 30 // 最多送入 reranker 的候选数（扩大候选池，避免相关片段过早被截断）
const MIN_RELEVANCE = 0.2 // 专用 rerank API 打分（0-1）低于此值的结果将被过滤（从 0.1 提升到 0.2，更积极过滤低相关块）

/** 从 chatModel 猜测对应的专用 rerank 模型名，若无法判断则使用通用默认值 */
function resolveRerankModel(config: RAGConfig): string {
  if (config.rerankModel) return config.rerankModel
  return "BAAI/bge-reranker-v2-m3"
}

interface SiliconFlowRerankResponse {
  results: { index: number; relevance_score: number }[]
}

/** Sigmoid 归一化：将无界 logit 分数压缩到 [0,1] */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/**
 * 优先调用硅基流动 /v1/rerank 专用接口
 * 返回 null 表示调用失败，由上层决定是否降级
 */
async function rerankViaAPI(
  question: string,
  candidates: SearchResult[],
  config: RAGConfig
): Promise<RerankResult[] | null> {
  try {
    // [修复] Rerank API 通常部署在 Embedding 同一服务商（如 SiliconFlow），
    // 优先使用 embeddingApiKey/embeddingApiBase，而非 chat 模型的 apiKey/apiBase
    // 之前使用 config.apiKey 导致 401 认证失败，reranker 从未真正生效
    const rerankApiKey = config.embeddingApiKey || config.apiKey
    const rerankBaseUrl = (config.embeddingApiBase || config.apiBase)
      .replace(/\/+$/, "")
      .replace(/\/embeddings\/?$/, "") // 去掉 /embeddings 后缀
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

    // bge-reranker-v2-m3 返回的是 logit 原始分（可超过 1），需要 sigmoid 归一化到 [0,1]
    // 否则高分 chunk（如总结章节得分 5.7）会碾压专题章节（0.04），
    // 导致 MMR 多样性惩罚完全失效
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

/** 降级方案：用普通 chat 模型输出 JSON 评分（保留作为兜底，兼容不支持 /rerank 的服务商） */
async function rerankViaChatModel(
  question: string,
  candidates: SearchResult[],
  config: RAGConfig
): Promise<RerankResult[] | null> {
  try {
    const chunkTexts = candidates.map((r, i) => {
      const preview = r.chunk.content.slice(0, 1500) // 与 rerank API 路径保持一致
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

/**
 * 对检索结果进行重排序
 *
 * @param question 用户问题
 * @param results 检索结果（已按 RRF 分数排序）
 * @param config RAG 配置
 * @returns 重排序后的结果（低分结果已过滤）
 */
export async function rerankResults(
  question: string,
  results: SearchResult[],
  config: RAGConfig
): Promise<SearchResult[]> {
  if (results.length <= 3) return results

  // 取 Top-N 候选
  const candidates = results.slice(0, MAX_CANDIDATES)

  // 优先走专用 rerank API，失败则降级到 chat 模型 JSON 方案，再失败则保留原序
  let scores = await rerankViaAPI(question, candidates, config)
  let usedFallback = false
  if (!scores) {
    scores = await rerankViaChatModel(question, candidates, config)
    usedFallback = true
  }

  if (!scores || scores.length === 0) {
    // 所有 API 方案都失败，使用本地关键词匹配 reranker
    console.warn("[reranker] All API rerank strategies failed, using local keyword reranker")
    scores = localKeywordRerank(question, candidates)
    usedFallback = true
  }

  // 构建 ID → score 映射
  const scoreMap = new Map<string, number>()
  for (const s of scores) {
    scoreMap.set(s.id, s.score)
  }

  const minScore = usedFallback ? 0.5 : MIN_RELEVANCE

  // 对候选项按分数重排序
  const reranked = candidates
    .map((r) => ({
      result: r,
      llmScore: scoreMap.get(r.chunk.id) ?? 0,
    }))
    .sort((a, b) => b.llmScore - a.llmScore)

  // 过滤低分结果
  const kept = reranked
    .filter((r) => r.llmScore >= minScore)
    .map((r) => ({
      ...r.result,
      score: usedFallback ? r.llmScore / 10 : r.llmScore,
    }))

  // 如果过滤后结果太少，放宽阈值，至少保留合理数量
  const afterFilter = kept.length >= 5
    ? kept
    : reranked.slice(0, Math.min(8, candidates.length)).map((r) => ({
        ...r.result,
        score: usedFallback ? r.llmScore / 10 : r.llmScore,
      }))

  // MMR（最大边际相关性）多样性重排序：
  // 避免同一文件的多个 chunk 占据所有 top 位置，确保跨文件信息覆盖
  // [优化] lambda 从 0.7 降到 0.5，增强跨文件多样性
  // 综合总结类章节（如第15章）会匹配几乎所有查询关键词，
  // 需要更强的多样性惩罚才能让专门章节的内容浮上来
  // [优化] lambda 从 0.5 → 0.4：更偏多样性
  // 评测显示综合章节的 chunk 霸占 Top-5，需要更强的跨文件分散力
  const finalResults = mmrDiversify(afterFilter, 0.4, afterFilter.length)

  // 追加未参与 rerank 的剩余结果（保持原序），避免丢失候选池外的长尾结果
  const rerankedIds = new Set(candidates.map((r) => r.chunk.id))
  const remaining = results.filter((r) => !rerankedIds.has(r.chunk.id))

  console.debug(
    `[reranker] (${usedFallback ? "chat-fallback" : "rerank-api"}) Reranked ${candidates.length} candidates, kept ${finalResults.length} after filtering`
  )

  return [...finalResults, ...remaining]
}

/**
 * MMR（Maximal Marginal Relevance）多样性重排序
 *
 * 在保留原始相关性排序的基础上，惩罚同一文件已被选中过多的情况，
 * 确保跨文件的互补信息不被单一高分文件挤出候选池。
 *
 * @param results 按相关性排好序的候选列表
 * @param lambda  相关性 vs 多样性的权衡系数（0-1，越大越偏重相关性）
 * @param maxResults 最多保留的结果数
 */
function mmrDiversify(
  results: SearchResult[],
  lambda: number,
  maxResults: number
): SearchResult[] {
  if (results.length <= 1) return results

  const selected: SearchResult[] = []
  const remaining = [...results]
  // 记录每个文件已被选中的次数
  const fileSelectionCount = new Map<string, number>()

  // 归一化分数到 0-1（最高分=1）
  const maxScore = remaining[0]?.score || 1

  while (selected.length < maxResults && remaining.length > 0) {
    let bestIdx = 0
    let bestMmrScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i]
      const relevance = r.score / maxScore

      // 多样性惩罚：同一文件已选中越多，惩罚越重
      const fileCount = fileSelectionCount.get(r.chunk.filename) || 0
      // [优化] 加大惩罚力度：第1个不惩罚，第2个惩罚0.6，第3个惩罚0.8，
      // 第4个及以后惩罚0.95，让每个文件的第一个 chunk 有更大优势
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

/**
 * 本地关键词匹配 reranker（零 API 调用）
 *
 * 当 rerank API 和 chat model 都不可用时的最终降级方案。
 * 使用 query-chunk 的词汇重叠度来估算相关性，比简单保留 RRF 原始排序更准确。
 *
 * 打分策略：
 * 1. 标题精确匹配（headingPath + fileTitle 包含查询词）→ 高权重
 * 2. 内容词汇重叠（Jaccard-like）→ 基础分
 * 3. 查询词在内容中的密度（TF）→ 区分泛泛提及 vs 深入讨论
 * 4. 文件名匹配 → 辅助加分
 *
 * 返回 0-10 分（与 chat-model fallback 一致的量纲）
 */
function localKeywordRerank(question: string, candidates: SearchResult[]): RerankResult[] {
  // 提取查询关键词
  const queryTerms: string[] = []
  // 中文词（2字以上）
  const cjkMatches = question.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g)
  if (cjkMatches) queryTerms.push(...cjkMatches)
  // 英文词（3字符以上）
  const enMatches = question.match(/[a-zA-Z][a-zA-Z0-9_]{2,}/g)
  if (enMatches) queryTerms.push(...enMatches.map(t => t.toLowerCase()))
  // 数字（用于匹配具体数值）
  const numMatches = question.match(/\d[\d,]+/g)
  if (numMatches) queryTerms.push(...numMatches)

  if (queryTerms.length === 0) {
    // 无法提取关键词，返回基于 RRF 原始分的排序
    return candidates.map(r => ({ id: r.chunk.id, score: r.score * 10 }))
  }

  // 使用分词器获取查询词集合
  const queryTokens = tokenizeToSet(question)

  const results = candidates.map(r => {
    const chunk = r.chunk
    const contentLower = chunk.content.toLowerCase()
    const headingText = chunk.headingPath.join(" ").toLowerCase()
    const titleText = (chunk.fileTitle || "").toLowerCase()
    const metaText = headingText + " " + titleText

    let score = 0

    // 1. 标题/标题路径中的查询词匹配（高权重）
    let titleMatches = 0
    for (const term of queryTerms) {
      if (metaText.includes(term.toLowerCase())) titleMatches++
    }
    // 标题匹配分：最多贡献 3 分
    score += Math.min(titleMatches * 1.5, 3)

    // 2. 内容中查询词的覆盖率
    let contentHits = 0
    for (const term of queryTerms) {
      if (contentLower.includes(term.toLowerCase())) contentHits++
    }
    const coverage = contentHits / queryTerms.length
    // 覆盖分：最多贡献 3 分
    score += coverage * 3

    // 3. 查询词在内容中的密度（区分深入讨论 vs 泛泛提及）
    let totalOccurrences = 0
    for (const term of queryTerms) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
      const matches = contentLower.match(regex)
      if (matches) totalOccurrences += matches.length
    }
    // 密度分：按内容长度归一化，最多贡献 2 分
    const density = totalOccurrences / Math.max(chunk.content.length / 100, 1)
    score += Math.min(density * 2, 2)

    // 4. 词集重叠度（Jaccard-like，利用分词器与 BM25 一致）
    const chunkTokens = tokenizeToSet(chunk.content.slice(0, 2000))
    let overlap = 0
    for (const t of queryTokens) {
      if (chunkTokens.has(t)) overlap++
    }
    const jaccardLike = queryTokens.size > 0 ? overlap / queryTokens.size : 0
    // Jaccard 分：最多贡献 2 分
    score += jaccardLike * 2

    // 5. 原始 RRF 分作为微调（保留检索阶段信号）
    // RRF 分通常在 0-0.04 范围，放大到 0-1 范围
    score += Math.min(r.score * 25, 1)

    return { id: chunk.id, score: Math.min(score, 10) }
  })

  // 综合章节惩罚：如果同一文件的多个 chunk 都获得高分，
  // 说明该文件是"什么都沾一点"的总结性内容，而非深入讨论某个主题。
  // 对这类文件降权，让专题章节有机会排上来。
  const idToFilename = new Map<string, string>()
  for (const c of candidates) idToFilename.set(c.chunk.id, c.chunk.filename)

  const fileScores = new Map<string, number[]>()
  for (const r of results) {
    const fn = idToFilename.get(r.id) || ""
    if (!fileScores.has(fn)) fileScores.set(fn, [])
    fileScores.get(fn)!.push(r.score)
  }
  // 如果一个文件有超过 4 个 chunk 都高于中位数，认为是综合章节
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
        r.score *= 0.7 // 综合章节降权 30%
      }
    }
  }

  return results
}

/** 解析 LLM 返回的 JSON 分数（仅用于 chat-model 降级路径，使用统一鲁棒 JSON 解析器） */
function parseRerankResponse(content: string): RerankResult[] {
  // 使用统一的鲁棒 JSON 解析器（3 级降级：直接解析 → markdown 代码块 → 花括号提取）
  const parsed = parseRobustJSON(content) as Record<string, unknown> | null
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.scores)) {
    return parsed.scores.map((s: { id: string; score: number }) => ({
      id: String(s.id),
      score: Number(s.score),
    }))
  }

  // 最后手段：用正则从损坏的 JSON 文本中抢救 "id": "xxx" ... "score": n 键值对
  // 应对模型输出语法损坏（多余逗号、缺失括号）但键值本身完整的情况
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
