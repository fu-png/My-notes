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

// ─── Defaults ───

export const DEFAULT_API_BASE = "https://api.openai.com/v1"
export const DEFAULT_MODEL = "gpt-4o-mini"
export const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5"
export const DEFAULT_EMBEDDING_API_BASE = "https://api.siliconflow.cn/v1/embeddings"
export const DEFAULT_EMBEDDING_API_KEY = "sk-ebxhsvnivkfeoozfsrrdwbquvjjcdwwsfaiiketszdymvbnx"
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

/**
 * Get the full embedding config for RAG.
 * If "use same key" is enabled (default), reuses the chat API key/base.
 * Otherwise returns the independently configured embedding API key/base.
 */
export function getEmbeddingConfig(): EmbeddingConfig | null {
  if (typeof window === "undefined") return null

  const embeddingModel = localStorage.getItem(STORAGE_KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL

  const embApiKey = localStorage.getItem(STORAGE_KEY_EMBEDDING_API_KEY) || ""
  const embApiBase = localStorage.getItem(STORAGE_KEY_EMBEDDING_API_BASE) || ""

  if (embApiKey) {
    return {
      apiKey: embApiKey,
      apiBase: embApiBase || DEFAULT_EMBEDDING_API_BASE,
      embeddingModel,
    }
  }

  // 使用内置的 embedding API 默认配置（BAAI/bge-large-zh-v1.5 + SiliconFlow）
  // 这样即使用户没有单独配置 embedding API，也能正常构建索引
  return {
    apiKey: DEFAULT_EMBEDDING_API_KEY,
    apiBase: DEFAULT_EMBEDDING_API_BASE,
    embeddingModel,
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
