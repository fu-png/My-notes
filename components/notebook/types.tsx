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
  content: `你好！我是你的 AI 笔记助手。我可以帮你：\n\n- 总结当前文档内容\n- 回答关于文档的问题\n- 帮你改写或润色文字\n- 生成新的笔记内容\n\n选择一个文档开始吧！`,
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
