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

// ─── Chat History Storage ───

const CHAT_HISTORY_KEY = "ai-chat-history"

export function loadConversations(projectId: string): Conversation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(`${CHAT_HISTORY_KEY}-${projectId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveConversations(projectId: string, conversations: Conversation[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(`${CHAT_HISTORY_KEY}-${projectId}`, JSON.stringify(conversations))
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
    description: "clean editorial magazine style with elegant serif headings, generous whitespace, and muted color palette",
    colors: "charcoal, cream, muted gold accents",
  },
  {
    id: "corporate",
    name: "商务风",
    description: "modern corporate presentation with bold sans-serif, structured layout, professional blue tones",
    colors: "navy blue, white, light gray",
  },
  {
    id: "minimal",
    name: "极简风",
    description: "ultra-minimalist design with lots of white space, thin lines, single accent color",
    colors: "white, black, one accent color",
  },
  {
    id: "tech",
    name: "科技风",
    description: "futuristic tech presentation with dark background, glowing neon accents, gradient elements",
    colors: "dark navy, electric blue, cyan glow",
  },
  {
    id: "clay",
    name: "粘土风",
    description: "playful 3D clay-style illustrations with soft pastel colors, rounded shapes, friendly typography",
    colors: "pastel pink, mint, lavender, cream",
  },
  {
    id: "isometric",
    name: "等距风",
    description: "isometric 3D illustration style with clean geometric shapes, flat colors, modern infographic look",
    colors: "teal, orange, yellow, light gray",
  },
  {
    id: "kawaii",
    name: "可爱风",
    description: "cute kawaii style with rounded fonts, pastel colors, small decorative elements, friendly icons",
    colors: "pink, baby blue, mint, yellow",
  },
  {
    id: "vintage",
    name: "复古风",
    description: "retro vintage design with warm tones, classic typography, paper texture feel",
    colors: "sepia, warm brown, cream, dark red",
  },
  {
    id: "brick",
    name: "砖块风",
    description: "Lego/brick style with blocky elements, bold colors, pixelated aesthetic",
    colors: "red, yellow, blue, black, white",
  },
  {
    id: "popart",
    name: "波普风",
    description: "pop art style with bold colors, halftone patterns, comic book aesthetics",
    colors: "bright red, yellow, blue, black outlines",
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
