/**
 * 鲁棒 JSON 解析器
 *
 * 从 LLM 返回的文本中提取 JSON，支持多级降级策略：
 * 1. 直接 JSON.parse
 * 2. 从 markdown 代码块（```json...```）中提取
 * 3. 从首个 {...} 花括号对中提取
 *
 * 被 query-decomposer、reranker 等模块共享使用，
 * 消除重复的 JSON 提取逻辑。
 */

/**
 * 尝试从 LLM 返回的文本中解析 JSON
 * @returns 解析后的对象，或 null（全部降级策略失败时）
 */
export function parseRobustJSON(content: string): unknown {
  // 策略 1：直接解析
  try {
    return JSON.parse(content)
  } catch {
    // fallthrough
  }

  // 策略 2：从 markdown 代码块中提取
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim())
    } catch {
      // fallthrough
    }
  }

  // 策略 3：从花括号提取
  const braceMatch = content.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0])
    } catch {
      // fallthrough
    }
  }

  return null
}
