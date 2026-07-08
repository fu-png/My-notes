/**
 * 查询分解器
 *
 * 调用 LLM 将复杂问题拆解为 1-5 个搜索子查询
 * 简单问题直接返回原查询，不浪费 token
 */

import type { RAGConfig, DecomposedQuery } from "./types.js"
import { parseRobustJSON } from "./json-parser.js"

const DECOMPOSE_SYSTEM_PROMPT = `你是一个搜索查询优化器。你的任务是分析用户的问题，判断是否需要拆解为多个子查询来检索文档。

规则：
1. 如果问题简单直接（如"什么是 X"、"解释 Y"），直接返回原始问题作为唯一查询
2. 如果问题涉及对比、多个概念、或需要从不同角度检索（如"A 和 B 的区别"、"有哪些方法可以..."），拆解为 2-5 个子查询
3. 每个子查询应该简短、聚焦，适合用于语义搜索和关键词搜索
4. 子查询应该互补而非重叠，覆盖问题的不同方面

你必须严格按以下 JSON 格式返回，不要有其他任何内容：
{
  "reasoning": "简要说明你的判断理由",
  "sub_queries": ["子查询1", "子查询2", ...]
}`

const DECOMPOSE_USER_TEMPLATE = `用户问题：{question}

请分析这个问题并返回搜索子查询。`

/**
 * 分解用户查询为多个搜索子查询
 *
 * 先做快速判断：如果问题看起来足够简单，直接返回原查询，节省一次 LLM 调用
 */
export async function decomposeQuery(
  question: string,
  config: RAGConfig
): Promise<DecomposedQuery> {
  // 快速路径：非常短的问题或明显的简单问题，跳过 LLM
  if (isSimpleQuery(question)) {
    return {
      original: question,
      subQueries: [question],
      reasoning: "简单问题，无需分解",
    }
  }

  try {
    const baseUrl = (config.apiBase || "").replace(/\/+$/, "")
    if (!baseUrl) {
      return {
        original: question,
        subQueries: [question],
        reasoning: "API Base URL 未配置",
      }
    }
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages: [
          { role: "system", content: DECOMPOSE_SYSTEM_PROMPT },
          {
            role: "user",
            content: DECOMPOSE_USER_TEMPLATE.replace("{question}", question),
          },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
    })

    if (!response.ok) {
      // LLM 调用失败时 fallback 到原始查询
      console.warn("[query-decomposer] LLM call failed, using original query")
      return {
        original: question,
        subQueries: [question],
        reasoning: "LLM 调用失败，使用原始查询",
      }
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
    }
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return {
        original: question,
        subQueries: [question],
        reasoning: "LLM 返回为空",
      }
    }

    // 解析 JSON 响应
    const parsed = parseDecomposeResponse(content)
    return {
      original: question,
      subQueries:
        parsed.subQueries.length > 0 ? parsed.subQueries : [question],
      reasoning: parsed.reasoning,
    }
  } catch (err) {
    console.warn("[query-decomposer] Error:", err)
    return {
      original: question,
      subQueries: [question],
      reasoning: "解析失败，使用原始查询",
    }
  }
}

/** 预编译复杂度指标正则（仅在模块加载时编译一次） */
const COMPLEX_INDICATOR_PATTERNS = [
  "对比", "区别", "不同", "差异", "比较",
  "哪些", "列举", "总结", "概述", "综合",
  "分别", "各自", "以及", "和.*的关系",
  "之间", "还是", "还是说", "同时", "另外", "此外",
  "vs", "compare", "difference", "versus",
  "how.*and.*", "what are the", "list",
  "summarize", "overview", "between", "relation", "impact",
].map(p => new RegExp(p, "i"))

/** 快速判断是否是简单问题 */
function isSimpleQuery(question: string): boolean {
  const trimmed = question.trim()

  // [修复] 将 CJK 最小长度从 8 降到 4，英文从 20 降到 10
  const cjkCount = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkCount > 0) {
    if (trimmed.length < 4) return true
  } else {
    if (trimmed.length < 10) return true
  }

  // 不包含对比、多概念标志词
  return !COMPLEX_INDICATOR_PATTERNS.some(re => re.test(trimmed))
}

/** 解析 LLM 的 JSON 响应（使用统一的鲁棒 JSON 解析器） */
function parseDecomposeResponse(content: string): {
  subQueries: string[]
  reasoning: string
} {
  const parsed = parseRobustJSON(content) as Record<string, unknown> | null
  if (parsed && typeof parsed === "object") {
    return {
      subQueries: Array.isArray(parsed.sub_queries)
        ? parsed.sub_queries.filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0)
        : [],
      reasoning: (parsed.reasoning as string) || "",
    }
  }
  return { subQueries: [], reasoning: "JSON 解析失败" }
}
