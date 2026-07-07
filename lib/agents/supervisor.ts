/**
 * Supervisor Agent — 意图识别 & 任务路由
 *
 * 两层级联检测策略（Anthropic Building Effective Agents — Routing 工作流）：
 *   1. 规则快筛（detectIntent）— 零延迟，处理高频无歧义意图
 *   2. LLM 意图识别（detectIntentWithLLM）— 1-3 秒，处理规则无法确定的模糊意图
 *
 * 提示词来源：ai-config.ts 中 agent-supervisor 智能体的 systemPrompt（单一来源）
 * 用户在设置中自定义 supervisor 提示词后，LLM 检测自动使用新版本
 */

// ---------------------------------------------------------------------------
// Intent group constants — 用于路由判断
// ---------------------------------------------------------------------------

/** 内容生成类意图 — 走 handleGenerate 流程 */
export const GENERATE_INTENT_TYPES = new Set([
  "summary", "faq", "guide", "outline", "timeline", "briefing",
])

/** 智能体类意图 — 走 streamAI + 对应智能体提示词 */
export const AGENT_INTENT_TYPES = new Set([
  "translate", "writer", "coder", "podcast",
])

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

export type IntentType =
  | "chat"
  | "ppt"
  | "web_search"
  | "translate"
  | "deep_research"
  | "summary"
  | "faq"
  | "guide"
  | "outline"
  | "timeline"
  | "briefing"
  | "writer"
  | "coder"
  | "podcast"

export interface ChatIntent {
  type: "chat"
  /** true = 闲聊（你好/谢谢），false = 知识问答（需要 RAG 检索） */
  needsRAG?: boolean
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

export interface DeepResearchIntent {
  type: "deep_research"
  query: string
}

export interface GenerateIntent {
  type: "summary" | "faq" | "guide" | "outline" | "timeline" | "briefing"
}

export interface AgentIntent {
  type: "writer" | "coder" | "podcast"
}

export type DetectedIntent =
  | ChatIntent
  | PptIntent
  | WebSearchIntent
  | TranslateIntent
  | DeepResearchIntent
  | GenerateIntent
  | AgentIntent

// ---------------------------------------------------------------------------
// Context passed to the router
// ---------------------------------------------------------------------------

export interface DetectIntentContext {
  /** When true, PPT detection is skipped (user is already in a PPT flow) */
  hasPptSession?: boolean
}

export interface DetectIntentLLMContext extends DetectIntentContext {
  apiKey?: string
  apiBase?: string
  model?: string
  /** Supervisor 提示词 — 从 ai-config.ts 的 agent-supervisor 加载，支持用户自定义 */
  supervisorPrompt?: string
}

// ---------------------------------------------------------------------------
// LLM System Prompt — 默认兜底版本（用户可在设置中自定义 agent-supervisor 覆盖）
// ---------------------------------------------------------------------------

/**
 * 默认 Supervisor 提示词 — 精简版。
 * 当未从 ai-config.ts 传入自定义提示词时使用此兜底版本。
 * 用户在设置中自定义 agent-supervisor 提示词后，detectIntentSmart 会传入新版本。
 *
 * 设计原则（Anthropic）：信任 LLM 的理解能力，不需要列举所有触发词。
 * 只需给出意图名称 + 一句话描述 + 输出格式即可。
 */
const DEFAULT_SUPERVISOR_PROMPT = `你是意图识别智能体。分析用户输入，返回 JSON 指示如何处理。

意图类型：
- deep_research: 用户想深入研究或系统学习一个主题
- web_search: 需要联网获取实时/外部信息（URL链接 / 搜索前缀 / 最新事件动态 / 产品对比评测口碑）。
  纯知识性提问、方法论提问（如"XX有哪些常见问题/原理是什么"）不算，除非明确要求外部最新资料。
  action: search | web | youtube | github | bilibili
- ppt: 用户想生成PPT（同时包含PPT关键词和生成动词，或隐晦表达"做成能讲的/演示的"）
- summary / faq / guide / outline / timeline / briefing: 生成对应类型的项目内容
- podcast: 生成播客对话
- translate: 翻译一段文字/文档本身。若翻译对象是代码或代码注释，归为 coder，而非 translate
- writer: 写作润色、改写、续写（含语言风格转换但非逐句翻译的场景）
- coder: 代码相关（含代码翻译、代码注释转换、代码审查、正则表达式等）
- chat: 以上都不匹配时
  needsRAG=false: 纯社交性闲聊（问候、感谢、确认等），且内容不涉及任何具体主题
  needsRAG=true: 知识问答（涉及文档内容、概念、技术术语，或指代此前讨论过的方案/文档，即使句式像闲聊）

判断原则：
1. 一句话中包含多个任务时（如"先搜索A，再生成PPT"），以最终交付物类型为准，不按先后顺序判断。
2. 遇到"不用/不需要/不要/别再"等否定词时，先排除被否定的那个意图，再判断剩余部分真正想要什么。
3. 提到"链接/仓库/视频"但当前输入中并无实际URL时，说明用户可能指代之前的内容，不要凭空编造URL或仓库信息，判为 chat。
4. 只要输入中包含实际URL，一律判为 web_search（对应 action），不要被"总结/摘要/介绍一下"等词带偏判成 summary——网页/视频内容需要先抓取才能总结，属于 web_search 流程的一部分。

输出格式（严格JSON，不要markdown标记）：
{"intent":"deep_research","query":"研究主题"}
{"intent":"web_search","action":"search","query":"搜索词","url":"链接"}
{"intent":"ppt","userText":"原始输入"}
{"intent":"summary"}
{"intent":"chat","needsRAG":false}`

// ---------------------------------------------------------------------------
// Rule-based detectors (fallback)
// ---------------------------------------------------------------------------

export function isPptIntent(text: string): boolean {
  const lower = text.toLowerCase().trim()
  const keywords = [
    "ppt", "幻灯片", "演示文稿", "slides", "slide deck",
    "presentation", "做演示", "做个演示", "整理成演示", "做成可以讲的",
  ]
  const actions = ["生成", "做", "制作", "创建", "整理", "搞个", "来个", "弄个"]
  // 查询类特征词——用于排除"关于PPT本身的提问"（如"PPT里第3页是什么"）。
  // 注意：不能简单地在整句里搜这些词，因为复合任务句（如"搜一下最新日志，然后整理成PPT"）
  // 中"最新"只是描述搜索对象，句子的最终交付物仍是 PPT，不应被误伤排除。
  const queryIndicators = /(什么是|怎么|如何|查看|打开|第.{0,3}页|内容是|语法|错误|趋势|工具)/
  // 这几个词只有在没有明确 PPT 生成收尾动作时才代表"单纯查询"，否则可能只是复合任务的前半句
  const softQueryIndicators = /(最新|最近)/
  const hasKeyword = keywords.some((kw) => lower.includes(kw))
  const hasAction = actions.some((a) => lower.includes(a))
  const hasPattern = /把.{0,20}(做成|转为|转成|变成).{0,10}(ppt|幻灯片|演示|slides)/.test(lower)
  // 明确的"生成/整理成PPT"收尾动作——出现时说明句子最终交付物是 PPT，不应被查询类特征词排除。
  // 需排除否定语境（"不用/不需要/不要...生成PPT"），避免把否定句误判为有明确输出动作。
  const hasNegation = /(不用|不需要|不要|别|无需)[^。！？，,]{0,6}(生成|做|制作|整理|转成|转为)/.test(lower)
  const hasExplicitPptOutput =
    !hasNegation &&
    /(整理成|做成|生成|转成|转为|做一份|来一份)[^。！？]{0,15}(ppt|幻灯片|演示文稿|slides)/.test(lower)

  const isQuery = queryIndicators.test(lower) || (softQueryIndicators.test(lower) && !hasExplicitPptOutput)
  if (isQuery && !hasExplicitPptOutput) return false
  // 否定语境（"不用做PPT了，先..."）下，即使同时命中关键词+动作词，也不应判定为PPT意图，
  // 除非后文另有经过否定校验的明确PPT产出动作（hasExplicitPptOutput）。
  if (hasNegation && !hasExplicitPptOutput) return false
  return (hasKeyword && hasAction) || hasPattern || hasExplicitPptOutput
}

export function detectWebSearchIntent(text: string): WebSearchIntent | null {
  const trimmed = text.trim()

  const urlMatch = trimmed.match(/https?:\/\/[^\s,，。！？;;；)\]】》]+/)
  if (urlMatch) {
    const url = urlMatch[0]
    if (/youtube\.com|youtu\.be/i.test(url)) return { type: "web_search", action: "youtube", url }
    if (/github\.com/i.test(url)) {
      const repoMatch = url.match(/github\.com\/([^/]+\/[^/\s?#]+)/)
      return repoMatch
        ? { type: "web_search", action: "github", query: repoMatch[1] }
        : { type: "web_search", action: "web", url }
    }
    if (/bilibili\.com|b23\.tv/i.test(url)) return { type: "web_search", action: "bilibili", url }
    return { type: "web_search", action: "web", url }
  }

  const searchPrefixes = ["搜索", "搜一下", "查一下", "帮我搜", "帮我查", "帮我找", "search", "look up", "find"]
  for (const prefix of searchPrefixes) {
    if (trimmed.toLowerCase().startsWith(prefix)) {
      const query = trimmed.slice(prefix.length).replace(/^[：:\s]+/, "").trim()
      if (query) return { type: "web_search", action: "search", query }
    }
  }

  const implicitPatterns = [
    /(?:最新|最近|今年|2024|2025|2026).*(?:趋势|动态|进展|新闻|消息|发展|报道)/,
    /(?:现在|目前|当前|当下).*(?:怎么样|如何|什么情况|状态)/,
    /(?:有没有|有哪些|推荐一些?).*(?:工具|框架|库|教程|资源|方案|文章)/,
    /(?:对比|比较|区别|差异).*(?:和|与|vs|VS)/,
    /(?:怎么评价|如何看待|大家怎么看|口碑|测评|评测)/,
    // "什么是X" 通常是知识问答（走RAG），不应当隐式触发网络搜索
    // 只有明确要求外部信息时才触发，如"介绍一下X的发展历史"
  ]
  for (const pattern of implicitPatterns) {
    if (pattern.test(trimmed)) return { type: "web_search", action: "search", query: trimmed }
  }

  return null
}

/** 规则兜底：快速关键词检测 deep_research */
function isDeepResearchIntent(text: string): boolean {
  const lower = text.toLowerCase().trim()
  const keywords = [
    "深入研究", "深度研究", "deep research", "系统学习",
    "全面了解", "帮我研究", "调研", "深入分析", "全面分析",
  ]
  return keywords.some((kw) => lower.includes(kw))
}

// ---------------------------------------------------------------------------
// Rule-based fallback router
// ---------------------------------------------------------------------------

/**
 * 明确的闲聊 — 问候/感谢/确认/告别，语义上不需要 RAG 检索。
 * 注意：不用 \b（词边界），因为 \b 不兼容 CJK 字符（好/谢 等不是 word char）
 */
function isCasualChitchat(text: string): boolean {
  const trimmed = text.trim()
  const casualPatterns = [
    /^(你好|您好|hi|hello|hey|哈喽|嗨)/i,
    /^(谢谢|感谢|thanks|thank you|多谢)/i,
    /^(好的|嗯|ok|okay|收到|明白)/i,
    /^(再见|拜拜|bye)/i,
  ]
  return casualPatterns.some((p) => p.test(trimmed)) && trimmed.length < 20
}

export function detectIntent(text: string, context?: DetectIntentContext): DetectedIntent {
  if (!context?.hasPptSession && isPptIntent(text)) {
    return { type: "ppt", userText: text }
  }
  if (isDeepResearchIntent(text)) {
    return { type: "deep_research", query: text }
  }
  const webIntent = detectWebSearchIntent(text)
  if (webIntent) return webIntent
  // 明确的闲聊（问候/感谢/确认/告别）不需要 RAG 检索，与 isRuleDeterminable() 中
  // 判定"规则可确定"所用的同一套 casualPatterns 保持一致，避免级联路径下
  // needsRAG 字段缺失（undefined）而与 LLM 路径的显式 false 不一致。
  if (isCasualChitchat(text)) {
    return { type: "chat", needsRAG: false }
  }
  return { type: "chat" }
}

// ---------------------------------------------------------------------------
// LLM-based intent detection (primary)
// ---------------------------------------------------------------------------

function parseIntentJSON(content: string): Record<string, unknown> | null {
  let str = content.trim()
  // Strip markdown code blocks
  if (str.startsWith("```json")) str = str.slice(7)
  else if (str.startsWith("```")) str = str.slice(3)
  if (str.endsWith("```")) str = str.slice(0, -3)
  str = str.trim()
  try {
    return JSON.parse(str)
  } catch {
    const match = str.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function mapLLMResultToIntent(parsed: Record<string, unknown>, originalText: string): DetectedIntent {
  const intent = String(parsed.intent || parsed.type || "chat").toLowerCase()

  switch (intent) {
    case "deep_research":
      return { type: "deep_research", query: String(parsed.query || originalText) }

    case "ppt":
      return { type: "ppt", userText: String(parsed.userText || originalText) }

    case "web_search": {
      // LLM 返回了 web_search，但 URL/query 提取仍用规则（更可靠）
      const ruleBased = detectWebSearchIntent(originalText)
      if (ruleBased) return ruleBased
      return {
        type: "web_search",
        action: String(parsed.action || "search"),
        query: parsed.query ? String(parsed.query) : originalText,
        url: parsed.url ? String(parsed.url) : undefined,
      }
    }

    case "translate":
      return { type: "translate" }

    case "summary":
    case "faq":
    case "guide":
    case "outline":
    case "timeline":
    case "briefing":
      return { type: intent as GenerateIntent["type"] }

    case "writer":
      return { type: "writer" }

    case "coder":
      return { type: "coder" }

    case "podcast":
      return { type: "podcast" }

    default: {
      const needsRAG = parsed.needsRAG !== undefined ? Boolean(parsed.needsRAG) : true
      return { type: "chat", needsRAG }
    }
  }
}

/**
 * LLM 意图识别 — 通过 LLM 理解用户意图。
 * 超时 8 秒自动回退到规则检测。
 */
export async function detectIntentWithLLM(
  text: string,
  context?: DetectIntentLLMContext,
): Promise<DetectedIntent> {
  if (!context?.apiKey) {
    return detectIntent(text, context)
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const apiBase = (context.apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")
    const prompt = context.supervisorPrompt || DEFAULT_SUPERVISOR_PROMPT

    // 会话状态提示 — 修复此前的架构缺陷：hasPptSession 等上下文标志之前只用于
    // isRuleDeterminable() 的规则判断，一旦规则判定"不可确定"转发给 LLM 后就丢失了，
    // 导致 LLM 在用户已处于 PPT 编辑会话中时，仍会把带 PPT 关键词的话误判为重新生成 PPT。
    const sessionNotes: string[] = []
    if (context.hasPptSession) {
      sessionNotes.push(
        "用户当前正处于 PPT 编辑会话中，此时提及 PPT/幻灯片通常是希望在现有 PPT 上做修改（应判为 chat），而不是重新生成一份新的 PPT，除非用户明确表达'重新做一份新的/另一个主题的 PPT'。",
      )
    }
    const userContent = sessionNotes.length > 0
      ? `[会话状态]\n${sessionNotes.join("\n")}\n\n用户输入：${text}\n\n请直接返回一个 JSON 对象，不要有任何其他文字：`
      : `用户输入：${text}\n\n请直接返回一个 JSON 对象，不要有任何其他文字：`

    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.apiKey}`,
      },
      body: JSON.stringify({
        model: context.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: 200,
        // 关闭推理模型的思考过程（如 mimo-v2.5 / DeepSeek-R1 / Qwen3）。
        // 意图识别是简单分类任务，不需要推理，关闭后：
        // - 响应从 5-15 秒降到 <1 秒
        // - token 消耗从 200+ 降到 ~10
        // - content 不再为空（推理不再吃掉 max_tokens 预算）
        // 非推理模型（如 gpt-4o-mini）会忽略此参数，无副作用。
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) throw new Error(`API ${res.status}`)

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ""
    console.log("[supervisor] LLM raw response:", content)
    const parsed = parseIntentJSON(content)

    if (!parsed) {
      console.warn("[supervisor] Failed to parse LLM response, falling back to rules. Raw:", content)
      return detectIntent(text, context)
    }

    console.log("[supervisor] LLM intent detected:", parsed)
    return mapLLMResultToIntent(parsed, text)
  } catch (err) {
    console.warn("[supervisor] LLM intent detection failed, falling back to rules:", err)
    return detectIntent(text, context)
  }
}

// ---------------------------------------------------------------------------
// 智能意图识别：规则快筛 + LLM 兜底
// ---------------------------------------------------------------------------

/** 规则能确定的意图类型（无需 LLM） */
function isRuleDeterminable(text: string, context?: DetectIntentContext): boolean {
  // PPT 意图 — 关键词+动词双条件，规则可靠
  if (!context?.hasPptSession && isPptIntent(text)) return true
  // Deep Research — 明确关键词
  if (isDeepResearchIntent(text)) return true
  // 网络搜索 — URL 链接或显式搜索前缀
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  // 否定语境（"不用打开链接/不用搜索"）或引用历史对话（"上次/之前/刚才"）时，
  // 即使出现 URL 或搜索前缀，也不代表用户真的要发起一次实时联网搜索，交给 LLM 综合判断。
  const hasSearchNegation = /(不用|不需要|不要|别|无需)[^。！？，,]{0,8}(打开|搜索|搜一下|查|链接|访问)/.test(lower)
  const referencesPriorContext = /(上次|之前|刚才|上回|前面提到|你说的那)/.test(trimmed)
  if (!hasSearchNegation && !referencesPriorContext) {
    if (/^https?:\/\//i.test(trimmed)) return true
    const searchPrefixes = ["搜索", "搜一下", "查一下", "帮我搜", "帮我查", "帮我找", "search", "look up", "find"]
    // "搜索引擎"这类复合名词后面紧跟"是什么/的原理/怎么工作"等释义类问法时，
    // 说明"搜索"只是话题词的一部分，句子本质是知识问答而非搜索指令。
    const isDefinitionQuestionAboutTopic = /^搜索(引擎|算法|框架)[^。！？]{0,15}(是什么|原理|怎么工作|如何工作|是啥)/.test(trimmed)
    if (!isDefinitionQuestionAboutTopic && searchPrefixes.some((p) => lower.startsWith(p))) return true
  }
  // 明确的闲聊 — 问候/感谢/确认/告别
  if (isCasualChitchat(trimmed)) return true
  return false
}

/**
 * 智能意图识别 — 先规则快筛（零延迟），规则无法确定时才走 LLM。
 * 划词提问走纯规则（意图通常明确，不需 LLM）。
 *
 * 级联策略（Anthropic Routing 工作流 + Intent Classification Cascade）：
 *   1. 规则快筛 → 零延迟，覆盖高频无歧义意图
 *   2. LLM 兜底 → 1-3 秒，处理模糊/新颖/组合性意图
 *   3. LLM 失败/超时 → 降级回规则检测
 *
 * 反馈闭环：每次检测都记录来源（rule/llm）和结果，供未来优化。
 */
export async function detectIntentSmart(
  text: string,
  context?: DetectIntentLLMContext,
): Promise<DetectedIntent> {
  // 划词提问 → 纯规则
  if (!context || isRuleDeterminable(text, context)) {
    const result = detectIntent(text, context)
    console.log("[intent] rule", { text: text.slice(0, 50), intent: result.type })
    return result
  }
  // 规则无法确定 → LLM
  const result = await detectIntentWithLLM(text, context)
  console.log("[intent] llm", { text: text.slice(0, 50), intent: result.type })
  return result
}
