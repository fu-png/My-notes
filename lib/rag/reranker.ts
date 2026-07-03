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

const MAX_CANDIDATES = 30 // 最多送入 reranker 的候选数（扩大候选池，避免相关片段过早被截断）
const MIN_RELEVANCE = 0.1 // 专用 rerank API 打分（0-1）低于此值的结果将被过滤

/** 从 chatModel 猜测对应的专用 rerank 模型名，若无法判断则使用通用默认值 */
function resolveRerankModel(config: RAGConfig): string {
  if (config.rerankModel) return config.rerankModel
  return "BAAI/bge-reranker-v2-m3"
}

interface SiliconFlowRerankResponse {
  results: { index: number; relevance_score: number }[]
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
    const baseUrl = config.apiBase.replace(/\/+$/, "")
    const documents = candidates.map((r) => {
      const preview = r.chunk.content.slice(0, 1500)
      return `来源: ${r.chunk.fileTitle} > ${r.chunk.headingPath.join(" > ")}\n${preview}`
    })

    const response = await fetch(`${baseUrl}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
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
      score: r.relevance_score, // API 路径返回 0-1 原始分
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
      const preview = r.chunk.content.slice(0, 1000)
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
    console.warn("[reranker] All rerank strategies failed, using original order")
    return results
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
  const finalResults = kept.length >= 5
    ? kept
    : reranked.slice(0, Math.min(8, candidates.length)).map((r) => ({
        ...r.result,
        score: usedFallback ? r.llmScore / 10 : r.llmScore,
      }))

  // 追加未参与 rerank 的剩余结果（保持原序），避免丢失候选池外的长尾结果
  const rerankedIds = new Set(candidates.map((r) => r.chunk.id))
  const remaining = results.filter((r) => !rerankedIds.has(r.chunk.id))

  console.debug(
    `[reranker] (${usedFallback ? "chat-fallback" : "rerank-api"}) Reranked ${candidates.length} candidates, kept ${finalResults.length} after filtering`
  )

  return [...finalResults, ...remaining]
}

/** 解析 LLM 返回的 JSON 分数（仅用于 chat-model 降级路径） */
function parseRerankResponse(content: string): RerankResult[] {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed.scores)) {
      return parsed.scores.map((s: { id: string; score: number }) => ({
        id: String(s.id),
        score: Number(s.score),
      }))
    }
  } catch {
    // fallthrough
  }

  // 尝试从 markdown 代码块提取
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim())
      if (Array.isArray(parsed.scores)) {
        return parsed.scores.map((s: { id: string; score: number }) => ({
          id: String(s.id),
          score: Number(s.score),
        }))
      }
    } catch {
      // fallthrough
    }
  }

  // 尝试从花括号提取
  const braceMatch = content.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0])
      if (Array.isArray(parsed.scores)) {
        return parsed.scores.map((s: { id: string; score: number }) => ({
          id: String(s.id),
          score: Number(s.score),
        }))
      }
    } catch {
      // fallthrough
    }
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
