// ─── Types & Constants for Notebook Workspace ───

import {
  IconClipboardText,
  IconBulb,
  IconNotes,
  IconListDetails,
  IconTimeline,
  IconMessage,
} from "@tabler/icons-react"

export interface DocFile {
  filename: string
  title: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  docUpdate?: {
    content: string
    status: "pending" | "applied" | "rejected"
  }
  /** RAG 引用来源（仅 assistant 消息） */
  ragSources?: {
    filename: string
    fileTitle: string
    headingPath: string[]
    snippet: string
    score: number
  }[]
  /** 互联网搜索结果来源（Agent Reach） */
  webSources?: {
    action: string
    query?: string
    url?: string
    snippet: string
  }[]
  /** 用户划词引用的文本 */
  quotedText?: string
  /** 深度思考的推理过程内容 */
  reasoning?: string
  /** 笔记本指南生成的元信息 */
  generateMeta?: {
    type: string
    label: string
    done: boolean
  }
  /** 音频概述的元信息 */
  audioMeta?: {
    stage: "script" | "confirming" | "synthesizing" | "done" | "error"
    script?: { speaker: string; text: string }[]
    audioUrl?: string
    manifest?: { chunks: string[]; createdAt: string }
    progress?: string
  }
  /** PPT 生成的元信息 */
  pptMeta?: {
    step: "style-select" | "slide-count" | "custom-prompt" | "generating-outline" | "outline-review" | "generating-images" | "done" | "error"
    stylePreset?: string
    slideCount?: number
    customPrompt?: string
    userIntent?: string
    outline?: PptOutline
    slideImages?: SlideImage[]
    streamingText?: string
  }
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

// ─── Chat History Storage (OSS + localStorage cache) ───

const CHAT_HISTORY_KEY = "ai-chat-history"

/**
 * Load conversations: localStorage cache first (instant), then fetch from OSS.
 * Returns cached data synchronously via callback, then updates with OSS data.
 */
export function loadConversationsSync(projectId: string): Conversation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(`${CHAT_HISTORY_KEY}-${projectId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function loadConversations(projectId: string): Promise<Conversation[]> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/chat-history`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const conversations = data.conversations || []
    // Update localStorage cache
    try {
      localStorage.setItem(`${CHAT_HISTORY_KEY}-${projectId}`, JSON.stringify(conversations))
    } catch { /* ignore quota errors */ }
    return conversations
  } catch {
    // Fallback to localStorage
    return loadConversationsSync(projectId)
  }
}

/** Debounced save state to prevent rapid API calls */
const _saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function saveConversations(projectId: string, conversations: Conversation[]) {
  // Immediate localStorage cache update (sync, fast)
  const cleaned = cleanConversations(conversations)
  try {
    localStorage.setItem(`${CHAT_HISTORY_KEY}-${projectId}`, JSON.stringify(cleaned))
  } catch {
    // localStorage quota exceeded — try trimming older conversations
    try {
      const trimmed = cleaned.slice(0, 20) // keep only recent 20 conversations
      localStorage.setItem(`${CHAT_HISTORY_KEY}-${projectId}`, JSON.stringify(trimmed))
    } catch { /* give up on localStorage */ }
  }

  // Debounced OSS save (async, 1.5s delay)
  const existing = _saveTimers.get(projectId)
  if (existing) clearTimeout(existing)

  _saveTimers.set(projectId, setTimeout(async () => {
    _saveTimers.delete(projectId)
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/chat-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations }),
      })
    } catch (e) {
      console.error("[chat-history] OSS save failed:", e)
    }
  }, 1500))
}

/** Force flush any pending save immediately (call before page unload) */
export function flushPendingSave(projectId: string, conversations: Conversation[]) {
  const existing = _saveTimers.get(projectId)
  if (existing) {
    clearTimeout(existing)
    _saveTimers.delete(projectId)
  }
  // Use sendBeacon for reliable delivery on page unload
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      `/api/projects/${encodeURIComponent(projectId)}/chat-history`,
      new Blob([JSON.stringify({ conversations })], { type: "application/json" })
    )
  }
}

/** Clean conversations for storage: strip base64 data URLs and trim large fields */
function cleanConversations(conversations: Conversation[]): Conversation[] {
  return conversations.map((conv) => ({
    ...conv,
    messages: conv.messages.map((msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cleaned: any = { ...msg }
      // Trim reasoning to reduce storage (keep first 500 chars)
      if (cleaned.reasoning && cleaned.reasoning.length > 500) {
        cleaned.reasoning = cleaned.reasoning.slice(0, 500) + "…"
      }
      // Strip RAG source snippets (keep metadata only)
      if (cleaned.ragSources) {
        cleaned.ragSources = cleaned.ragSources.map((src: Record<string, unknown>) => ({
          ...src,
          snippet: typeof src.snippet === "string" && (src.snippet as string).length > 100
            ? (src.snippet as string).slice(0, 100) + "…"
            : src.snippet,
        }))
      }
      // Strip PPT slide base64 URLs
      if (cleaned.pptMeta?.slideImages) {
        cleaned.pptMeta = {
          ...cleaned.pptMeta,
          slideImages: cleaned.pptMeta.slideImages.map((img: Record<string, unknown>) => ({
            ...img,
            url: typeof img.url === "string" && !(img.url as string).startsWith("data:") ? img.url : null,
          })),
        }
      }
      return cleaned
    }),
  }))
}

/**
 * Migrate localStorage data to OSS (one-time, on first load).
 * Call this after loadConversations returns empty from OSS but localStorage has data.
 */
export async function migrateLocalToOSS(projectId: string): Promise<void> {
  const local = loadConversationsSync(projectId)
  if (local.length === 0) return

  try {
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/chat-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: local }),
    })
  } catch (e) {
    console.error("[chat-history] Migration failed:", e)
  }
}

// ─── Helpers ───

export function countWords(text: string): { chars: number; words: number } {
  const chars = text.replace(/\s/g, "").length
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const english = (text.match(/[a-zA-Z]+/g) || []).length
  return { chars, words: chinese + english }
}

// ─── Welcome message ───

export const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: `你好！我是你的 AI 笔记助手。我可以帮你：\n\n- 总结当前文档内容\n- 回答关于文档的问题\n- 帮你改写或润色文字\n- 生成新的笔记内容\n- 🌐 搜索互联网内容（发送链接或以「搜索」开头提问）\n\n选择一个文档开始吧！`,
  timestamp: new Date(0),
}

// ─── File Icon Helper ───

import {
  IconFile,
  IconFileText,
  IconFileCode,
  IconFileSpreadsheet,
  IconFileTypePdf,
} from "@tabler/icons-react"

export function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const className = "size-3.5 shrink-0"

  if (["pdf"].includes(ext)) return <IconFileTypePdf className={className} />
  if (["csv", "tsv", "xlsx"].includes(ext)) return <IconFileSpreadsheet className={className} />
  if (["js", "ts", "jsx", "tsx", "py", "go", "java", "rs", "sh", "css", "html", "htm", "xml", "json", "yaml", "yml", "toml", "ini", "env"].includes(ext))
    return <IconFileCode className={className} />
  if (["txt", "log", "md"].includes(ext)) return <IconFileText className={className} />
  return <IconFile className={className} />
}

// ─── AI Generate Templates ───

export const GENERATE_TEMPLATES = [
  { type: "summary", label: "项目摘要", desc: "全面概括所有文档", icon: IconClipboardText },
  { type: "faq", label: "常见问题", desc: "提炼 Q&A 问答", icon: IconBulb },
  { type: "guide", label: "学习指南", desc: "由浅入深的学习路径", icon: IconNotes },
  { type: "outline", label: "内容大纲", desc: "文档结构提取", icon: IconListDetails },
  { type: "timeline", label: "时间线", desc: "关键事件演进", icon: IconTimeline },
  { type: "briefing", label: "简报文档", desc: "精炼分享给团队", icon: IconMessage },
]

// ─── PPT Style Presets ───

export interface PptStylePreset {
  id: string
  name: string
  description: string
  colors: string
}

export const PPT_STYLE_PRESETS: PptStylePreset[] = [
  {
    id: "editorial",
    name: "编辑风",
    description: "High-end editorial magazine layout. Elegant serif headlines, asymmetric grid composition, generous negative space. Subtle paper texture background with refined drop shadows. Accent elements use thin gold hairlines and small decorative ligatures.",
    colors: "#2C2C2C charcoal, #FAF8F5 warm white, #C8A96B muted gold",
  },
  {
    id: "corporate",
    name: "商务风",
    description: "Premium corporate keynote style inspired by Apple and McKinsey decks. Clean geometric layout with bold weight sans-serif headings, soft rounded card containers for content blocks. Subtle gradient overlay on hero areas. Professional yet modern.",
    colors: "#1B3A5C deep navy, #FFFFFF white, #F0F4F8 soft gray, #3B82F6 accent blue",
  },
  {
    id: "minimal",
    name: "极简风",
    description: "Swiss-style minimalism with strict typographic hierarchy. Maximum whitespace, razor-thin divider lines, single accent color for emphasis. Content centered with mathematical precision. No decorative elements — pure content focus.",
    colors: "#FFFFFF white, #111111 near-black, #FF4D4D single red accent",
  },
  {
    id: "tech",
    name: "科技风",
    description: "Dark-mode futuristic interface aesthetic. Deep space background with subtle dot-grid pattern. Glowing edges on card elements, frosted glass (glassmorphism) content panels. Monospace typography for data, geometric sans for headlines. Circuit-trace decorative lines.",
    colors: "#0A0E1A dark space, #00D4FF electric cyan, #6366F1 purple glow, #1E293B panel dark",
  },
  {
    id: "clay",
    name: "粘土风",
    description: "3D claymorphism with soft rounded objects floating above a clean background. Thick matte surfaces with subtle top-light shading. Chunky friendly rounded sans-serif typography. Each content block has a pillowy raised appearance with soft ambient shadows.",
    colors: "#FFE4EC blush pink, #E0FFF0 mint cream, #E8E0FF lavender, #FFF9E6 warm cream",
  },
  {
    id: "isometric",
    name: "等距风",
    description: "Isometric 3D infographic style with precise 30-degree angles. Clean vector-like geometric shapes stacked in layered compositions. Flat bold fills with subtle edge highlights. Data visualization integrated naturally into the isometric scene.",
    colors: "#0D9488 teal, #F97316 vibrant orange, #FBBF24 golden yellow, #F1F5F9 light gray",
  },
  {
    id: "kawaii",
    name: "可爱风",
    description: "Japanese kawaii aesthetic with soft pastel palette, rounded bubble typography, tiny star and heart decorations scattered lightly. Content in cloud-shaped or rounded rectangle containers with 2px soft borders. Small illustrated mascot elements in corners.",
    colors: "#FFB5D8 sakura pink, #B8E6FF sky blue, #B8F5D8 mint, #FFF3B8 soft yellow",
  },
  {
    id: "vintage",
    name: "复古风",
    description: "Art-deco meets mid-century modern. Warm aged paper texture background, ornamental frame borders with geometric Art Deco patterns. Elegant display serif headings, subtle grain overlay. Rich warm tones with sophisticated gold foil accent details.",
    colors: "#F5E6D0 parchment, #8B4513 warm brown, #FFF8F0 cream, #A52A2A burgundy, #C8A96B gold foil",
  },
  {
    id: "brick",
    name: "砖块风",
    description: "Lego-inspired blocky construction aesthetic. Chunky pixel-rounded elements snapped to a visible grid. Bold primary color blocks with raised plastic-like highlights and subtle ABS plastic sheen. Playful stacking composition with brick-stud texture accents.",
    colors: "#DC2626 Lego red, #FACC15 brick yellow, #2563EB classic blue, #1F2937 dark, #FFFFFF white",
  },
  {
    id: "popart",
    name: "波普风",
    description: "Warhol/Lichtenstein pop art explosion. Ben-Day halftone dot patterns in backgrounds, thick black comic outlines on all elements, speech-bubble shaped containers for text. High contrast primary colors with dynamic diagonal compositions and starburst accents.",
    colors: "#EF4444 pop red, #FACC15 comic yellow, #3B82F6 bold blue, #111111 thick black outlines",
  },
]

// ─── PPT Slide Types ───

export interface PptSlide {
  pageNumber: number
  title: string
  bulletPoints: string[]
  speakerNote: string
  layout: "cover" | "content" | "section" | "closing"
  imageHint: string
}

export interface PptOutline {
  title: string
  style: string
  slides: PptSlide[]
}

export type SlideImageStatus = "pending" | "generating" | "done" | "error"

export interface SlideImage {
  index: number
  url: string | null
  status: SlideImageStatus
  error?: string
}
