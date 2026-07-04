/**
 * 统一的中英文混合分词器
 *
 * 提供标准的分词函数，被 BM25 索引、近重复检测等模块共享使用，
 * 确保整个 RAG 系统使用一致的分词策略。
 *
 * 分词策略：
 * - 英文按空格/标点分词（提取连续字母数字串，转小写）
 * - 中文使用 bigram（2 字滑窗），不再生成 unigram
 *   - 原因：unigram 使索引膨胀约 50%，且单字匹配精度过低
 *   - 对于单字中文输入，直接保留该字作为 token
 */

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g
const NON_CJK_WORD = /[a-zA-Z0-9_]+/g

/**
 * 混合分词（数组版本）
 * 用于 BM25 索引等需要保留重复 token 的场景
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []

  // 提取英文词
  let match: RegExpExecArray | null
  NON_CJK_WORD.lastIndex = 0
  while ((match = NON_CJK_WORD.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase())
  }

  // 提取中文 bigram（不再生成 unigram，减少索引膨胀并提升精度）
  CJK_RANGE.lastIndex = 0
  while ((match = CJK_RANGE.exec(text)) !== null) {
    const chars = match[0]
    if (chars.length === 1) {
      // 单个中文字符直接保留
      tokens.push(chars)
    } else {
      // bigram 滑窗
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1])
      }
    }
  }

  return tokens
}

/**
 * 混合分词（Set 版本）
 * 用于近重复检测等仅需要去重 token 集合的场景
 */
export function tokenizeToSet(text: string): Set<string> {
  const tokens = new Set<string>()

  // 英文词
  const enMatches = text.match(/[a-zA-Z0-9_]+/g)
  if (enMatches) enMatches.forEach((t) => tokens.add(t.toLowerCase()))

  // 中文 bigram
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g)
  if (cjkMatches) {
    for (const seg of cjkMatches) {
      if (seg.length === 1) {
        tokens.add(seg)
      } else {
        for (let i = 0; i < seg.length - 1; i++) {
          tokens.add(seg[i] + seg[i + 1])
        }
      }
    }
  }

  return tokens
}
