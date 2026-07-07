/**
 * AI Configuration Utility Functions
 *
 * Extracted from settings-dialog.tsx to decouple pure logic from React UI.
 * These functions manage localStorage-based AI provider configuration.
 */

// ─── Storage Keys ───

export const STORAGE_KEY_API_KEY = "ai-assistant-api-key"
export const STORAGE_KEY_API_BASE = "ai-assistant-api-base"
export const STORAGE_KEY_MODEL = "ai-assistant-model"
export const STORAGE_KEY_EMBEDDING_MODEL = "ai-assistant-embedding-model"
export const STORAGE_KEY_EMBEDDING_API_KEY = "ai-embedding-api-key"
export const STORAGE_KEY_EMBEDDING_API_BASE = "ai-embedding-api-base"
export const STORAGE_KEY_RERANK_MODEL = "ai-rerank-model"

// TTS 配置
export const STORAGE_KEY_TTS_API_KEY = "ai-tts-api-key"
export const STORAGE_KEY_TTS_API_BASE = "ai-tts-api-base"
export const STORAGE_KEY_TTS_MODEL = "ai-tts-model"
export const STORAGE_KEY_TTS_VOICE_HOST = "ai-tts-voice-host"
export const STORAGE_KEY_TTS_VOICE_EXPERT = "ai-tts-voice-expert"

// 生图模型配置
export const STORAGE_KEY_IMAGE_API_KEY = "ai-image-api-key"
export const STORAGE_KEY_IMAGE_API_BASE = "ai-image-api-base"
export const STORAGE_KEY_IMAGE_MODEL = "ai-image-model"

// 用户偏好 / AI Persona
export const STORAGE_KEY_PERSONA = "ai-persona-prompt"
export const STORAGE_KEY_USER_NAME = "ai-user-name"

// Multi-provider
export const STORAGE_KEY_PROVIDERS = "ai-assistant-providers"
export const STORAGE_KEY_ACTIVE_PROVIDER = "ai-assistant-active-provider"

// 智能体库
export const STORAGE_KEY_AGENTS = "ai-assistant-agents"
export const STORAGE_KEY_ACTIVE_AGENT = "ai-assistant-active-agent"

// ─── Agent Types ───

export type AgentCategory = "builtin" | "custom"

export interface AgentConfig {
  id: string
  name: string
  description: string
  /** system prompt，注入到 LLM 的系统消息中 */
  systemPrompt: string
  /** 图标名称（tabler icon 名），builtin 智能体有默认值 */
  icon: string
  /** 分类标签 */
  category: string
  /** 是否内置（不可删除） */
  builtin: boolean
  /** 创建时间 */
  createdAt: number
}

// ─── Defaults ───

export const DEFAULT_API_BASE = "https://api.openai.com/v1"
export const DEFAULT_MODEL = "gpt-4o-mini"
export const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3"
export const DEFAULT_EMBEDDING_API_BASE = "https://api.siliconflow.cn/v1/embeddings"
export const DEFAULT_RERANK_MODEL = "BAAI/bge-reranker-v2-m3"
export const DEFAULT_EMBEDDING_API_KEY = "sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua"
export const DEFAULT_TTS_MODEL = "mimo-v2.5-tts"
export const DEFAULT_TTS_VOICE_HOST = "冰糖"
export const DEFAULT_TTS_VOICE_EXPERT = "苏打"
export const DEFAULT_IMAGE_API_BASE = "https://www.hfsyapi.cn/v1/images/generations"
export const DEFAULT_IMAGE_MODEL = "gpt-image-2"

// ─── Provider Presets ───

export const PROVIDER_PRESETS = [
  { name: "OpenAI", apiBase: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"] },
  { name: "DeepSeek", apiBase: "https://api.deepseek.com", models: ["deepseek-chat", "deepseek-reasoner"] },
  { name: "硅基流动", apiBase: "https://api.siliconflow.cn/v1", models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"] },
  { name: "Moonshot", apiBase: "https://api.moonshot.cn/v1", models: ["moonshot-v1-8k", "moonshot-v1-32k"] },
  { name: "通义千问", apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-plus", "qwen-turbo", "qwen-max"] },
  { name: "智谱 GLM", apiBase: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-flash", "glm-4-air", "glm-4"] },
  { name: "自定义", apiBase: "", models: [] },
]

// ─── TTS Voice Options ───

export const TTS_VOICE_OPTIONS = [
  { value: "冰糖", label: "冰糖（中文女声）" },
  { value: "茉莉", label: "茉莉（中文女声）" },
  { value: "苏打", label: "苏打（中文男声）" },
  { value: "白桦", label: "白桦（中文男声）" },
  { value: "Mia", label: "Mia（英文女声）" },
  { value: "Chloe", label: "Chloe（英文女声）" },
  { value: "Milo", label: "Milo（英文男声）" },
  { value: "Dean", label: "Dean（英文男声）" },
]

// ─── Types ───

export interface ProviderInfo {
  id: string
  model: string
  apiBase: string
  isActive: boolean
}

export interface AIConfig {
  apiKey: string
  apiBase: string
  model: string
  embeddingModel?: string
}

export interface EmbeddingConfig {
  apiKey: string
  apiBase: string
  embeddingModel: string
  rerankModel: string
}

export interface TTSConfig {
  apiKey: string
  apiBase: string
  model: string
  voiceHost: string
  voiceExpert: string
}

export interface ImageConfig {
  apiKey: string
  apiBase: string
  model: string
}

// ─── Utility Functions ───

export function getAIConfig(): AIConfig | null {
  if (typeof window === "undefined") return null
  const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY)
  const apiBase = localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE
  const model = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
  const embeddingModel = localStorage.getItem(STORAGE_KEY_EMBEDDING_MODEL) || ""
  if (!apiKey) return null
  return { apiKey, apiBase, model, embeddingModel: embeddingModel || undefined }
}

export function getTTSConfig(): TTSConfig | null {
  if (typeof window === "undefined") return null
  const aiConfig = getAIConfig()
  const ttsApiKey = localStorage.getItem(STORAGE_KEY_TTS_API_KEY) || aiConfig?.apiKey || ""
  const ttsApiBase = localStorage.getItem(STORAGE_KEY_TTS_API_BASE) || aiConfig?.apiBase || DEFAULT_API_BASE
  const ttsModel = localStorage.getItem(STORAGE_KEY_TTS_MODEL) || DEFAULT_TTS_MODEL
  const voiceHost = localStorage.getItem(STORAGE_KEY_TTS_VOICE_HOST) || DEFAULT_TTS_VOICE_HOST
  const voiceExpert = localStorage.getItem(STORAGE_KEY_TTS_VOICE_EXPERT) || DEFAULT_TTS_VOICE_EXPERT

  if (!ttsApiKey) return null
  return { apiKey: ttsApiKey, apiBase: ttsApiBase, model: ttsModel, voiceHost, voiceExpert }
}

export function isAIConfigured(): boolean {
  if (typeof window === "undefined") return false
  return !!localStorage.getItem(STORAGE_KEY_API_KEY)
}

/** Get the configured model name (from settings) */
export function getConfiguredModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL
  return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
}

/** Get the configured embedding model name (for RAG indexing) */
export function getConfiguredEmbeddingModel(): string {
  if (typeof window === "undefined") return DEFAULT_EMBEDDING_MODEL
  return localStorage.getItem(STORAGE_KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL
}

/** Get the configured reranker model name */
export function getConfiguredRerankModel(): string {
  if (typeof window === "undefined") return DEFAULT_RERANK_MODEL
  return localStorage.getItem(STORAGE_KEY_RERANK_MODEL) || DEFAULT_RERANK_MODEL
}

/**
 * Get the full embedding config for RAG.
 * If "use same key" is enabled (default), reuses the chat API key/base.
 * Otherwise returns the independently configured embedding API key/base.
 */
export function getEmbeddingConfig(): EmbeddingConfig | null {
  if (typeof window === "undefined") return null

  const embeddingModel = localStorage.getItem(STORAGE_KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL
  const rerankModel = localStorage.getItem(STORAGE_KEY_RERANK_MODEL) || DEFAULT_RERANK_MODEL

  const embApiKey = localStorage.getItem(STORAGE_KEY_EMBEDDING_API_KEY) || ""
  const embApiBase = localStorage.getItem(STORAGE_KEY_EMBEDDING_API_BASE) || ""

  if (embApiKey) {
    return {
      apiKey: embApiKey,
      apiBase: embApiBase || DEFAULT_EMBEDDING_API_BASE,
      embeddingModel,
      rerankModel,
    }
  }

  // 使用内置的 embedding API 默认配置（BAAI/bge-m3 + SiliconFlow）
  // 这样即使用户没有单独配置 embedding API，也能正常构建索引
  return {
    apiKey: DEFAULT_EMBEDDING_API_KEY,
    apiBase: DEFAULT_EMBEDDING_API_BASE,
    embeddingModel,
    rerankModel,
  }
}

/**
 * 判断用户是否**主动**配置了 Embedding 模型（API Key 或 API Base 至少填了一个）。
 * 用于自动索引的前置判断：只有用户明确配置了向量模型才自动触发索引构建，
 * 避免仅配置了文本模型就后台偷偷跑 embedding。
 * 注意：这和 getEmbeddingConfig() 不同，后者总会返回内置默认值用于兜底。
 */
export function isEmbeddingConfigured(): boolean {
  if (typeof window === "undefined") return false
  const embApiKey = localStorage.getItem(STORAGE_KEY_EMBEDDING_API_KEY) || ""
  const embApiBase = localStorage.getItem(STORAGE_KEY_EMBEDDING_API_BASE) || ""
  return !!(embApiKey || embApiBase)
}

// ─── Image Generation Config ───

export function getImageConfig(): ImageConfig | null {
  if (typeof window === "undefined") return null
  const aiConfig = getAIConfig()
  const imageApiKey = localStorage.getItem(STORAGE_KEY_IMAGE_API_KEY) || aiConfig?.apiKey || ""
  const imageApiBase = localStorage.getItem(STORAGE_KEY_IMAGE_API_BASE) || DEFAULT_IMAGE_API_BASE
  const imageModel = localStorage.getItem(STORAGE_KEY_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL
  if (!imageApiKey) return null
  return { apiKey: imageApiKey, apiBase: imageApiBase, model: imageModel }
}

export function isImageConfigured(): boolean {
  if (typeof window === "undefined") return false
  const aiConfig = getAIConfig()
  return !!(localStorage.getItem(STORAGE_KEY_IMAGE_API_KEY) || aiConfig?.apiKey)
}

/** Get the user-defined persona prompt (custom AI behavior/style) */
export function getPersonaPrompt(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(STORAGE_KEY_PERSONA) || ""
}

/** Get the user's preferred name */
export function getUserName(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(STORAGE_KEY_USER_NAME) || ""
}

// ─── Multi-provider Functions ───

/** Get all configured providers for model switching */
export function getProviderList(): ProviderInfo[] {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS)
  if (!raw) return []
  try {
    const providers = JSON.parse(raw) as { id: string; model: string; apiBase: string; apiKey: string }[]
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROVIDER) || ""
    return providers
      .filter((p) => p.apiKey && p.model)
      .map((p) => ({ id: p.id, model: p.model, apiBase: p.apiBase, isActive: p.id === activeId }))
  } catch {
    return []
  }
}

/** Switch active provider and sync to legacy keys */
export function switchActiveProvider(providerId: string): string | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS)
  if (!raw) return null
  try {
    const providers = JSON.parse(raw) as { id: string; model: string; apiBase: string; apiKey: string }[]
    const target = providers.find((p) => p.id === providerId)
    if (!target) return null
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROVIDER, providerId)
    localStorage.setItem(STORAGE_KEY_API_KEY, target.apiKey)
    localStorage.setItem(STORAGE_KEY_API_BASE, target.apiBase || DEFAULT_API_BASE)
    localStorage.setItem(STORAGE_KEY_MODEL, target.model || DEFAULT_MODEL)
    window.dispatchEvent(new CustomEvent("ai-config-changed"))
    return target.model
  } catch {
    return null
  }
}

// ─── Built-in Agents ───

export const BUILTIN_AGENTS: AgentConfig[] = [
  {
    id: "agent-summary",
    name: "项目摘要",
    description: "全面概括所有文档的核心内容",
    systemPrompt: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。

请基于以下所有文档内容，生成一份全面的项目摘要。要求：
1. 首先用 2-3 句话概括项目的核心主题
2. 分主题总结各文档的关键内容
3. 提炼出最重要的 5-8 个核心概念
4. 总结文档之间的关联和整体架构
5. 使用中文，采用 Markdown 格式，适合作为项目总览笔记`,
    icon: "IconClipboardText",
    category: "内容分析",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-faq",
    name: "常见问题",
    description: "提炼 Q&A 问答对",
    systemPrompt: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。

请基于以下所有文档内容，生成一份 FAQ（常见问题解答）。要求：
1. 提炼出 8-12 个最可能被问到的问题
2. 问题应覆盖核心概念、使用方法、设计原因、常见误区等
3. 每个回答简洁有力，100-200 字，引用文档中的具体内容
4. 问题从浅到深排列
5. 使用中文，采用 Markdown 格式，每个 Q&A 用 ### 标题分隔`,
    icon: "IconBulb",
    category: "内容分析",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-guide",
    name: "学习指南",
    description: "由浅入深生成学习路径",
    systemPrompt: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。

请基于以下所有文档内容，生成一份系统的学习指南。要求：
1. 设计一条由浅入深的学习路径
2. 将内容分为"入门→进阶→深入"三个阶段
3. 每个阶段列出需要理解的关键概念和建议的阅读顺序
4. 标注前置知识要求和难度级别
5. 给出学习建议和实践练习方向
6. 使用中文，采用 Markdown 格式，适合打印或保存为笔记`,
    icon: "IconNotes",
    category: "学习辅助",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-outline",
    name: "内容大纲",
    description: "提取文档结构大纲",
    systemPrompt: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。

请基于以下所有文档内容，生成一份详细的内容大纲。要求：
1. 提取所有文档的标题层级结构
2. 在每个章节/段落下补充 1 行内容摘要
3. 标注各部分之间的逻辑关系（前置依赖、并列、递进等）
4. 统计每个部分的大致篇幅
5. 使用中文，采用 Markdown 多级标题格式`,
    icon: "IconListDetails",
    category: "内容分析",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-timeline",
    name: "时间线",
    description: "梳理关键事件时间线",
    systemPrompt: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。

请基于以下所有文档内容，生成一条逻辑时间线或演进路线。要求：
1. 如果文档包含时间信息，按时间顺序排列关键事件
2. 如果没有明确时间，按逻辑演进/因果关系排列
3. 每个节点包括：标题、简要描述（50 字内）、关键意义
4. 标注里程碑事件
5. 使用中文，采用 Markdown 格式，可以用列表或表格`,
    icon: "IconTimeline",
    category: "内容分析",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-briefing",
    name: "简报文档",
    description: "精炼内容生成团队简报",
    systemPrompt: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。

请基于以下所有文档内容，生成一份精炼的简报文档，适合分享给团队成员快速了解项目。要求：
1. 控制在 500-800 字
2. 结构为：背景 → 核心要点 → 关键发现 → 行动建议
3. 语言精炼、结论导向
4. 使用中文，采用 Markdown 格式`,
    icon: "IconMessage",
    category: "内容分析",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-ppt",
    name: "PPT 助手",
    description: "基于笔记内容生成演示文稿幻灯片",
    systemPrompt: `你是一个专业的 PPT 大纲设计师。请基于用户提供的文档内容，生成一个 8 页的演示文稿大纲。

核心原则：
1. 严格基于文档内容，不要编造文档中没有的信息
2. 必须充分覆盖文档中的核心内容和关键知识点，不能只做泛泛的总结
3. 如果文档包含多个章节或主题，每个重要章节/主题至少分配一页幻灯片
4. 内容页的要点应该包含具体的信息、数据、概念名称、技术术语，避免空泛的描述

页面布局规则：
- 第一页为封面（layout: "cover"），包含PPT主标题和副标题
- 最后一页为总结/结尾（layout: "closing"），归纳核心要点和行动建议
- 如果文档有多个章节，在每个章节的第一页使用章节页（layout: "section"）作为分隔
- 其余为内容页（layout: "content"），展开讲解具体内容

内容质量要求：
- 每页 3-5 个要点，每个要点应是一句完整的、有信息量的陈述，而非简单的标题词
- bulletPoints 中要包含文档中的关键概念、核心观点、具体方法或示例
- speakerNote 应包含更详细的解释、补充背景信息和过渡语句（100-200字）
- imageHint 用英文描述，应与该页核心主题相关，描述具体的视觉场景（不要用抽象词汇）

输出严格的 JSON 格式（不要包含 markdown 代码块标记），结构如下：
{
  "title": "PPT 标题",
  "style": "corporate",
  "slides": [
    {
      "pageNumber": 1,
      "title": "页面标题",
      "bulletPoints": ["具体的要点陈述1", "具体的要点陈述2", "具体的要点陈述3"],
      "speakerNote": "详细的演讲备注，包含过渡语、补充解释等...",
      "layout": "cover",
      "imageHint": "A specific visual scene description in English for AI image generation"
    }
  ]
}`,
    icon: "IconPresentation",
    category: "内容创作",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-podcast",
    name: "播客音频助手",
    description: "生成 Podcast 风格双人对话，边听边学",
    systemPrompt: `你是一个专业的播客脚本撰写人。请基于以下文档内容，生成一段信息密度高、引人入胜的双人对话脚本。

对话角色：
- Host（主持人）：负责引入话题、提出关键问题、做总结。语气亲切、好奇。
- Expert（专家）：负责深入解释概念、举例说明、分享洞察。语气专业但通俗易懂。

要求：
1. 对话应有 8-15 个回合（即 16-30 行台词）
2. 以 Host 开场，介绍今天讨论的话题
3. 涵盖文档中最重要的概念和亮点
4. 对话自然流畅，避免生硬地罗列信息
5. Expert 应该用比喻和例子让复杂概念更易理解
6. Host 在关键节点做简短总结，帮助听众跟上
7. 以 Host 做结束语收尾
8. 使用中文

**输出格式：** 严格输出 JSON 对象，包含一个 "dialogue" 字段，值为数组。数组每项包含 speaker ("host" 或 "expert") 和 text 字段。text 中如需使用双引号请用中文引号「」替代。不要添加任何其他文字、标记或注释。

示例输出格式：
{"dialogue": [
{"speaker": "host", "text": "大家好！今天我们..."},
{"speaker": "expert", "text": "确实是这样..."}
]}`,
    icon: "IconMicrophone",
    category: "内容创作",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-translator",
    name: "翻译助手",
    description: "多语言翻译，保持专业术语准确",
    systemPrompt: `你是一位专业翻译，精通多种语言。你的任务是將用户提供的文本翻译为目标语言（用户会指定目标语言）。

翻译原则：
1. 准确传达原文含义，不遗漏信息
2. 保持专业术语的准确性，必要时在括号中附上原文术语
3. 语句通顺自然，符合目标语言的表达习惯
4. 保持原文的语气和风格
5. 对于代码、命令、技术名词等保持原样不翻译

直接输出翻译结果，不要添加解释或注释。如果原文是 Markdown 格式，保持格式不变。`,
    icon: "IconLanguage",
    category: "实用工具",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-coder",
    name: "代码助手",
    description: "代码生成、解释和调试",
    systemPrompt: `你是一位资深编程助手，拥有全栈开发经验，精通多种编程语言和框架。

能力范围：
- 代码生成：根据需求编写高质量、可维护的代码
- 代码解释：逐行或逐块解释代码的功能和原理
- 调试建议：分析错误原因，提供修复方案
- 最佳实践：分享设计模式、性能优化和安全性建议
- 架构设计：讨论技术选型和系统设计权衡

回答规范：
1. 使用适当的代码块格式（标注语言），并添加必要注释
2. 先给出结论或代码，再解释原理
3. 讨论权衡取舍，而非只给一种方案
4. 优先考虑代码的安全性、可读性和性能
5. 如果问题有多种解法，简要对比优劣`,
    icon: "IconCode",
    category: "开发辅助",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-writer",
    name: "写作助手",
    description: "文章润色、改写和创意写作",
    systemPrompt: `你是一位专业写作助手，擅长各类文体的创作和编辑。

能力范围：
- 文章润色：改善语言表达、修正语法、提升可读性
- 风格改写：调整语气和风格（学术、商务、口语、文学等）
- 创意写作：文案、故事、脚本、诗歌等
- 内容扩写/缩写：扩展简短内容或精炼冗长文本
- 结构优化：调整段落结构、逻辑顺序、过渡衔接

回答规范：
1. 根据用户需求调整语言风格，保持逻辑清晰、表达准确
2. 使用 Markdown 格式输出
3. 润色时保留原文核心含义，说明主要修改点
4. 改写时提供 1-2 个不同风格的版本供选择
5. 注意中文写作的用语规范和文风一致性`,
    icon: "IconWriting",
    category: "内容创作",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-supervisor",
    name: "意图识别",
    description: "分析用户意图，智能路由到最合适的智能体执行任务",
    systemPrompt: `你是意图识别智能体。分析用户输入，返回 JSON 指示如何处理。

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
{"intent":"chat","needsRAG":false}`,
    icon: "IconBrain",
    category: "系统智能体",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-dr-plan",
    name: "研究规划师",
    description: "Deep Research 第一阶段：分析学习方向，规划学习路径并拆解子问题",
    systemPrompt: `你是一位专业的学习路径规划师。用户想学习一个新方向，你需要：

1. 分析这个学习方向
2. 规划 2-3 个学习阶段（从基础到进阶，不要超过 3 个）
3. 每个阶段拆解 2-3 个核心子问题（不要超过 3 个）
4. 输出严格的 JSON 格式

输出格式（必须是合法 JSON，不要包含 markdown 代码块标记）：
{
  "learningPath": [
    {
      "stage": "阶段名称",
      "topics": ["知识点1", "知识点2", "知识点3"],
      "order": 1
    }
  ],
  "subQuestions": [
    {
      "id": "q1",
      "question": "具体子问题",
      "status": "pending"
    }
  ]
}`,
    icon: "IconRoute",
    category: "深度研究",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-dr-reflect",
    name: "研究评估师",
    description: "Deep Research 第三阶段：评估搜索覆盖度，识别知识盲区，决定是否补充搜索",
    systemPrompt: `你是一位研究质量评估专家。请评估当前的研究材料是否充分覆盖了学习路径的各个方面。

请评估：
1. 每个学习阶段的覆盖度（0-1）
2. 是否存在知识盲区
3. 是否需要补充搜索

输出严格 JSON（不要 markdown 标记）：
{
  "coverage": 0.0到1.0的数字,
  "knowledgeGaps": ["盲区1", "盲区2"],
  "isSufficient": true或false,
  "newSubQuestions": [
    {"id": "q_new_1", "question": "补充子问题", "status": "pending"}
  ]
}`,
    icon: "IconSearch",
    category: "深度研究",
    builtin: true,
    createdAt: 0,
  },
  {
    id: "agent-dr-synthesize",
    name: "知识整理师",
    description: "Deep Research 第四阶段：整合所有搜索结果，生成结构化学习笔记",
    systemPrompt: `你是一位专业的知识整理专家。基于研究材料，生成一份完整的学习笔记。

请生成一份 Markdown 格式的学习笔记，结构如下：
1. 概述（学习方向介绍）
2. 按学习阶段依次展开每个知识点的讲解（含代码示例，如适用）
3. 实践建议
4. 参考资源

要求：内容详实、条理清晰、有深度。直接输出 Markdown 内容，以 # 标题开头。`,
    icon: "IconClipboardText",
    category: "深度研究",
    builtin: true,
    createdAt: 0,
  },
]

// ─── Agent Storage Functions ───

/** 获取所有智能体（内置 + 自定义） */
export function getAllAgents(): AgentConfig[] {
  const customs = getCustomAgents()
  return [...BUILTIN_AGENTS, ...customs]
}

/** 获取自定义智能体 */
export function getCustomAgents(): AgentConfig[] {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem(STORAGE_KEY_AGENTS)
  if (!raw) return []
  try {
    return JSON.parse(raw) as AgentConfig[]
  } catch {
    return []
  }
}

/** 保存自定义智能体列表 */
export function saveCustomAgents(agents: AgentConfig[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(agents))
  window.dispatchEvent(new CustomEvent("ai-config-changed"))
}

/** 获取当前激活的智能体 ID */
export function getActiveAgentId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(STORAGE_KEY_ACTIVE_AGENT)
}

/** 设置当前激活的智能体 */
export function setActiveAgent(agentId: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY_ACTIVE_AGENT, agentId)
  window.dispatchEvent(new CustomEvent("ai-config-changed"))
}

/** 获取当前激活的智能体配置 */
export function getActiveAgent(): AgentConfig | null {
  const id = getActiveAgentId()
  if (!id) return null
  const all = getAllAgents()
  return all.find(a => a.id === id) || null
}

/** 意图类型 → 智能体 ID 映射 */
const INTENT_AGENT_MAP: Record<string, string> = {
  translate: "agent-translator",
  writer: "agent-writer",
  coder: "agent-coder",
  podcast: "agent-podcast",
  summary: "agent-summary",
  faq: "agent-faq",
  guide: "agent-guide",
  outline: "agent-outline",
  timeline: "agent-timeline",
  briefing: "agent-briefing",
  ppt: "agent-ppt",
  supervisor: "agent-supervisor",
}

/**
 * 根据意图类型获取对应智能体的 system prompt。
 * 优先级：意图映射的智能体 > 用户激活的智能体 > 用户自定义 persona。
 * 用于 streamAI 中将意图识别结果注入到聊天 system prompt。
 */
export function getAgentSystemPrompt(intentType: string): string | null {
  // 1. 意图映射到特定智能体 → 用该智能体的 prompt
  const mappedAgentId = INTENT_AGENT_MAP[intentType]
  if (mappedAgentId) {
    const all = getAllAgents()
    // 如果用户自定义了同 ID 的智能体，优先用自定义的
    const custom = all.find(a => a.id === mappedAgentId && !a.builtin)
    if (custom) return custom.systemPrompt
    const builtin = all.find(a => a.id === mappedAgentId && a.builtin)
    if (builtin) return builtin.systemPrompt
  }
  // 2. chat / web_search → 检查用户是否激活了智能体
  if (intentType === "chat" || intentType === "web_search") {
    const activeAgent = getActiveAgent()
    if (activeAgent) return activeAgent.systemPrompt
  }
  return null
}

