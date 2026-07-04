/**
 * Supervisor Agent — 意图识别 & 任务路由
 *
 * 统一的意图检测入口，替代散落在 notebook-workspace.tsx 中的
 * isPptIntent() 和 detectWebIntent() 等逻辑
 */

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

export type IntentType = "chat" | "ppt" | "web_search" | "translate"

export interface ChatIntent {
  type: "chat"
}

export interface PptIntent {
  type: "ppt"
  userText: string
}

export interface WebSearchIntent {
  type: "web_search"
  action: string // 'search' | 'web' | 'youtube' | 'github' | 'bilibili'
  query?: string
  url?: string
}

export interface TranslateIntent {
  type: "translate"
}

export type DetectedIntent =
  | ChatIntent
  | PptIntent
  | WebSearchIntent
  | TranslateIntent

// ---------------------------------------------------------------------------
// Context passed to the router
// ---------------------------------------------------------------------------

export interface DetectIntentContext {
  /** When true, PPT detection is skipped (user is already in a PPT flow) */
  hasPptSession?: boolean
}

// ---------------------------------------------------------------------------
// Individual detectors
// ---------------------------------------------------------------------------

/**
 * Detect whether the user text expresses an intent to create a PPT/presentation.
 */
export function isPptIntent(text: string): boolean {
  const lower = text.toLowerCase().trim()
  const keywords = [
    "ppt",
    "幻灯片",
    "演示文稿",
    "slides",
    "slide deck",
    "presentation",
    "做演示",
    "做个演示",
    "整理成演示",
    "做成可以讲的",
  ]
  // [P1 FIX] 收紧动词列表，只保留明确表达“创建/生成”意图的动词
  const actions = ["生成", "做", "制作", "创建", "整理", "搞个", "来个", "弄个"]
  // 排除词：当这些词出现时，通常是在提问而非要求生成
  const queryIndicators = /(什么是|怎么|如何|查看|打开|第.{0,3}页|内容是|语法|错误|最新|趋势|工具)/
  const hasKeyword = keywords.some((kw) => lower.includes(kw))
  const hasAction = actions.some((a) => lower.includes(a))
  const hasPattern = /把.{0,20}(做成|转为|转成|变成).{0,10}(ppt|幻灯片|演示|slides)/.test(lower)
  const isQuery = queryIndicators.test(lower)
  // [P1 FIX] 不再仅凭“hasKeyword && 短文本”就判定为 PPT 意图，必须同时有生成类动词
  if (isQuery) return false
  return (hasKeyword && hasAction) || hasPattern
}

/**
 * Detect whether the user text expresses a web-search or URL-based intent.
 * Returns null when no web intent is detected.
 */
export function detectWebSearchIntent(text: string): WebSearchIntent | null {
  const trimmed = text.trim()

  // 1. URL detection (highest priority)
  // [P1 FIX] Exclude trailing CJK/common punctuation from URL capture
  const urlMatch = trimmed.match(/https?:\/\/[^\s,，。！？;;；)\]】》]+/)
  if (urlMatch) {
    const url = urlMatch[0]
    if (/youtube\.com|youtu\.be/i.test(url)) {
      return { type: "web_search", action: "youtube", url }
    }
    if (/github\.com/i.test(url)) {
      const repoMatch = url.match(/github\.com\/([^/]+\/[^/\s?#]+)/)
      return repoMatch
        ? { type: "web_search", action: "github", query: repoMatch[1] }
        : { type: "web_search", action: "web", url }
    }
    if (/bilibili\.com|b23\.tv/i.test(url)) {
      return { type: "web_search", action: "bilibili", url }
    }
    return { type: "web_search", action: "web", url }
  }

  // 2. Explicit search prefixes
  const searchPrefixes = [
    "搜索",
    "搜一下",
    "查一下",
    "帮我搜",
    "帮我查",
    "帮我找",
    "search",
    "look up",
    "find",
  ]
  for (const prefix of searchPrefixes) {
    if (trimmed.toLowerCase().startsWith(prefix)) {
      const query = trimmed.slice(prefix.length).replace(/^[：:\s]+/, "").trim()
      if (query) {
        return { type: "web_search", action: "search", query }
      }
    }
  }

  // 3. Implicit search intent patterns
  const implicitPatterns = [
    /(?:最新|最近|今年|2024|2025|2026).*(?:趋势|动态|进展|新闻|消息|发展|报道)/,
    /(?:现在|目前|当前|当下).*(?:怎么样|如何|什么情况|状态)/,
    /(?:有没有|有哪些|推荐一些?).*(?:工具|框架|库|教程|资源|方案|文章)/,
    /(?:对比|比较|区别|差异).*(?:和|与|vs|VS)/,
    /(?:怎么评价|如何看待|大家怎么看|口碑|测评|评测)/,
    /(?:什么是|介绍一下)(?!.*(?:文档|笔记|这个|本文|这篇))/,
  ]
  for (const pattern of implicitPatterns) {
    if (pattern.test(trimmed)) {
      return { type: "web_search", action: "search", query: trimmed }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

/**
 * Unified intent detection entry point.
 *
 * Runs detectors in priority order:
 *   1. PPT (skipped when context.hasPptSession is true)
 *   2. Web Search / URL
 *   3. Chat (default fallback)
 */
export function detectIntent(text: string, context?: DetectIntentContext): DetectedIntent {
  // 1. PPT intent (skip if already in a PPT session)
  if (!context?.hasPptSession && isPptIntent(text)) {
    return { type: "ppt", userText: text }
  }

  // 2. Web search / URL intent
  const webIntent = detectWebSearchIntent(text)
  if (webIntent) {
    return webIntent
  }

  // 3. Default — plain chat
  return { type: "chat" }
}
