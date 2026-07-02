/**
 * LLM 重排序器
 *
 * 对混合检索后的候选结果进行二次精排：
 * 1. 取 Top-N 候选 chunk（经过 RRF 融合后）
 * 2. 用 LLM 对每个 chunk 与查询的相关性打分（0-10）
 * 3. 按 LLM 分数重新排序，过滤低分结果
 *
 * 如果 LLM 调用失败，降级返回原始排序
 */

import type { RAGConfig, SearchResult } from "./types"

const MAX_CANDIDATES = 15 // 最多送入 reranker 的候选数
const MIN_SCORE = 5 // LLM 打分低于此值的结果将被过滤

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

/**
 * 用 LLM 对检索结果进行重排序
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

  try {
    // 构建用户消息：问题 + 所有候选片段
    const chunkTexts = candidates.map((r, i) => {
      const preview = r.chunk.content.slice(0, 500) // 截断过长的片段
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
      console.warn("[reranker] LLM call failed, using original order")
      return results
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
    }
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      console.warn("[reranker] Empty response, using original order")
      return results
    }

    // 解析 LLM 返回的分数
    const scores = parseRerankResponse(content)
    if (scores.length === 0) {
      console.warn("[reranker] Failed to parse scores, using original order")
      return results
    }

    // 构建 ID → score 映射
    const scoreMap = new Map<string, number>()
    for (const s of scores) {
      scoreMap.set(s.id, s.score)
    }

    // 对候选项按 LLM 分数重排序
    const reranked = candidates
      .map((r) => ({
        result: r,
        llmScore: scoreMap.get(r.chunk.id) ?? 0,
      }))
      .sort((a, b) => b.llmScore - a.llmScore)

    // 过滤低分结果，合并未参与 rerank 的剩余结果
    const kept = reranked
      .filter((r) => r.llmScore >= MIN_SCORE)
      .map((r) => ({
        ...r.result,
        // 用 LLM 分数归一化后替换原始 score
        score: r.llmScore / 10,
      }))

    // 如果过滤后结果太少，放宽阈值
    const finalResults = kept.length >= 3
      ? kept
      : reranked.slice(0, Math.min(5, candidates.length)).map((r) => ({
          ...r.result,
          score: r.llmScore / 10,
        }))

    // 追加未参与 rerank 的剩余结果（保持原序）
    const rerankedIds = new Set(candidates.map((r) => r.chunk.id))
    const remaining = results.filter((r) => !rerankedIds.has(r.chunk.id))

    console.log(
      `[reranker] Reranked ${candidates.length} candidates, kept ${finalResults.length} after filtering`
    )

    return [...finalResults, ...remaining]
  } catch (err) {
    console.warn("[reranker] Error:", err)
    return results
  }
}

/** 解析 LLM 返回的 JSON 分数 */
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

  return []
}
