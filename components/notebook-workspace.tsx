"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  IconFile,
  IconFileText,
  IconFileCode,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconFilePlus,
  IconUpload,
  IconTrash,
  IconLoader2,
  IconX,
  IconCheck,
  IconEdit,
  IconEye,
  IconSend,
  IconChevronLeft,
  IconChevronRight,
  IconSparkles,
  IconLetterCase,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconPlus,
  IconHistory,
  IconArrowLeft,
  IconMessage,
  IconLink,
  IconLanguage,
  IconDatabase,
  IconQuote,
  IconNotes,
  IconListDetails,
  IconTimeline,
  IconClipboardText,
  IconBulb,
  IconCopy,
  IconDownload,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { getAIConfig, isAIConfigured, getConfiguredModel } from "@/components/settings-dialog"
import { RichTextEditor } from "@/components/rich-text-editor"

// ─── Types ───

interface DocFile {
  filename: string
  title: string
}

interface ChatMessage {
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
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

// ─── Chat History Storage ───

const CHAT_HISTORY_KEY = "ai-chat-history"

function loadConversations(projectId: string): Conversation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(`${CHAT_HISTORY_KEY}-${projectId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveConversations(projectId: string, conversations: Conversation[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(`${CHAT_HISTORY_KEY}-${projectId}`, JSON.stringify(conversations))
}

interface NotebookWorkspaceProps {
  projectId: string
  projectName: string
}

// ─── Welcome message (static, defined outside component to avoid recreation) ───

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: `你好！我是你的 AI 笔记助手。我可以帮你：\n\n- 总结当前文档内容\n- 回答关于文档的问题\n- 帮你改写或润色文字\n- 生成新的笔记内容\n\n选择一个文档开始吧！`,
  timestamp: new Date(0),
}

// ─── Helpers ───

function countWords(text: string): { chars: number; words: number } {
  const chars = text.replace(/\s/g, "").length
  // Count Chinese chars + English words
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const english = (text.match(/[a-zA-Z]+/g) || []).length
  return { chars, words: chinese + english }
}

// ─── File Icon Helper ───

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const className = "size-3.5 shrink-0"

  if (["pdf"].includes(ext)) return <IconFileTypePdf className={className} />
  if (["csv", "tsv", "xlsx"].includes(ext)) return <IconFileSpreadsheet className={className} />
  if (["js", "ts", "jsx", "tsx", "py", "go", "java", "rs", "sh", "css", "html", "htm", "xml", "json", "yaml", "yml", "toml", "ini", "env"].includes(ext))
    return <IconFileCode className={className} />
  if (["txt", "log", "md"].includes(ext)) return <IconFileText className={className} />
  return <IconFile className={className} />
}

// ─── Table of Contents ───

interface TocItem {
  id: string
  text: string
  level: number
}

function extractHeadings(markdown: string): TocItem[] {
  const headings: TocItem[] = []
  const lines = markdown.split("\n")
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/[*_`~\[\]]/g, "").trim()
      // Generate slug matching rehype-slug behavior
      const id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
      headings.push({ id, text, level })
    }
  }
  return headings
}

function TableOfContents({ content }: { content: string }) {
  const headings = React.useMemo(() => extractHeadings(content), [content])
  const [activeId, setActiveId] = React.useState<string>("")
  const [open, setOpen] = React.useState(true)

  React.useEffect(() => {
    if (headings.length === 0) return

    const scrollContainer = document.getElementById("doc-content-scroll")
    if (!scrollContainer) return

    const handleScroll = () => {
      const headingElements = headings
        .map((h) => ({ id: h.id, el: scrollContainer.querySelector(`#${CSS.escape(h.id)}`) }))
        .filter((h) => h.el !== null)

      let current = ""
      for (const { id, el } of headingElements) {
        const rect = el!.getBoundingClientRect()
        const containerRect = scrollContainer.getBoundingClientRect()
        if (rect.top - containerRect.top <= 80) {
          current = id
        }
      }
      setActiveId(current)
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => scrollContainer.removeEventListener("scroll", handleScroll)
  }, [headings])

  if (headings.length < 2) return null

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="sticky top-0 h-fit shrink-0">
      <div className={`flex flex-col border-r transition-all ${open ? "w-64" : "w-10"}`}>
        {/* 标题栏 */}
        <div className={`flex items-center border-b px-2 py-[9px] ${open ? "justify-between" : "justify-center"}`}>
          {open && (
            <span className="pl-1 text-sm font-medium text-foreground">目录</span>
          )}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              {open ? (
                <IconChevronLeft className="size-4" />
              ) : (
                <IconChevronRight className="size-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* 目录内容 */}
        <CollapsibleContent>
          <div className="h-[calc(100vh-8rem)] overflow-y-auto overflow-x-hidden p-3">
            <ul className="w-full space-y-0.5">
              {headings.map((heading, i) => (
                <li key={`${heading.id}-${i}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`#${heading.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          const scrollContainer = document.getElementById("doc-content-scroll")
                          const target = scrollContainer?.querySelector(`#${CSS.escape(heading.id)}`)
                          if (target) {
                            target.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                        }}
                        className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap py-1.5 pr-2 text-[13px] leading-normal transition-colors ${
                          activeId === heading.id
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                        style={{ paddingLeft: `${(heading.level - minLevel) * 12 + 8}px` }}
                      >
                        {heading.text}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-60">
                      {heading.text}
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ─── Main Component ───

export function NotebookWorkspace({ projectId, projectName }: NotebookWorkspaceProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const chatEndRef = React.useRef<HTMLDivElement>(null)
  const chatScrollRef = React.useRef<HTMLDivElement>(null)
  const userScrolledUpRef = React.useRef(false)

  // File state
  const [files, setFiles] = React.useState<DocFile[]>([])
  const [loadingFiles, setLoadingFiles] = React.useState(true)
  const [activeFile, setActiveFile] = React.useState<string | null>(null)
  const [fileContent, setFileContent] = React.useState("")
  const [loadingContent, setLoadingContent] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  // Editor state
  const [editMode, setEditMode] = React.useState(false)
  const [editContent, setEditContent] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // New file inline creation
  const [creatingFile, setCreatingFile] = React.useState(false)
  const [newFileName, setNewFileName] = React.useState("")

  // URL import state
  const [createMode, setCreateMode] = React.useState<"file" | "url">("file")
  const [importUrl, setImportUrl] = React.useState("")
const [importingUrl, setImportingUrl] = React.useState(false)

// Translation
const [translating, setTranslating] = React.useState(false)

// RAG state
const [ragEnabled, setRagEnabled] = React.useState(false)
const [indexStatus, setIndexStatus] = React.useState<{
  indexed: boolean
  lastIndexedAt?: string
  totalChunks?: number
  totalFiles?: number
} | null>(null)
const [indexing, setIndexing] = React.useState(false)
const [indexProgress, setIndexProgress] = React.useState<string>("")
const [showSources, setShowSources] = React.useState(false)
const [sourcesData, setSourcesData] = React.useState<{
  files: { filename: string; fileTitle: string; chunkCount: number; totalTokens: number; headings: string[] }[]
  totalChunks: number
  totalTokens: number
} | null>(null)
const [sourcesLoading, setSourcesLoading] = React.useState(false)

// AI note generation
const [generating, setGenerating] = React.useState(false)

// Audio overview
const [audioOpen, setAudioOpen] = React.useState(false)
const [audioGenerating, setAudioGenerating] = React.useState(false)
const [audioProgress, setAudioProgress] = React.useState("")
const [audioScript, setAudioScript] = React.useState<{ speaker: string; text: string }[] | null>(null)
const [audioUrl, setAudioUrl] = React.useState<string | null>(null)
const [audioPlaying, setAudioPlaying] = React.useState(false)
const [audioCurrentLine, setAudioCurrentLine] = React.useState(-1)
const audioRef = React.useRef<HTMLAudioElement | null>(null)
const speechRef = React.useRef<{ cancel: () => void } | null>(null)

// AI panel resize — use ref + rAF to avoid re-renders during drag
  const [aiPanelWidth, setAiPanelWidth] = React.useState(320)
  const aiPanelRef = React.useRef<HTMLDivElement>(null)

  const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = aiPanelRef.current?.offsetWidth ?? 320
    let rafId: number | null = null
    let latestWidth = startWidth

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      latestWidth = Math.min(Math.max(startWidth + delta, 260), 600)
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (aiPanelRef.current) {
            aiPanelRef.current.style.width = `${latestWidth}px`
          }
          rafId = null
        })
      }
    }

    const handleMouseUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      setAiPanelWidth(latestWidth)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  // Chat state
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [chatInput, setChatInput] = React.useState("")
  const [chatLoading, setChatLoading] = React.useState(false)
  const [chatModel, setChatModel] = React.useState("gpt-4o-mini")

  // Sync chatModel from localStorage on mount and when settings change
  React.useEffect(() => {
    setChatModel(getConfiguredModel())
    const handler = () => setChatModel(getConfiguredModel())
    window.addEventListener("ai-config-changed", handler)
    return () => window.removeEventListener("ai-config-changed", handler)
  }, [])

  // Conversation history
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)

  // Load conversations from localStorage on mount
  React.useEffect(() => {
    setConversations(loadConversations(projectId))
  }, [projectId])

  // Save current conversation when messages change (debounced to avoid localStorage thrashing during streaming)
  const savePendingRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (chatMessages.length <= 1) return

    if (savePendingRef.current) clearTimeout(savePendingRef.current)
    savePendingRef.current = setTimeout(() => {
      const now = new Date().toISOString()
      const firstUserMsg = chatMessages.find((m) => m.role === "user")
      const title = firstUserMsg?.content.slice(0, 30) || "新对话"

      setConversations((prev) => {
        let updated: Conversation[]
        if (activeConversationId) {
          updated = prev.map((c) =>
            c.id === activeConversationId
              ? { ...c, messages: chatMessages, title, updatedAt: now }
              : c
          )
        } else {
          const newId = `conv-${Date.now()}`
          setActiveConversationId(newId)
          updated = [{ id: newId, title, messages: chatMessages, createdAt: now, updatedAt: now }, ...prev]
        }
        saveConversations(projectId, updated)
        return updated
      })
    }, 800)

    return () => {
      if (savePendingRef.current) clearTimeout(savePendingRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages])

  const startNewConversation = () => {
    setActiveConversationId(null)
    setChatMessages([WELCOME_MESSAGE])
    setShowHistory(false)
  }

  const loadConversation = (conv: Conversation) => {
    setActiveConversationId(conv.id)
    setChatMessages(conv.messages)
    setShowHistory(false)
  }

  const deleteConversation = (convId: string) => {
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== convId)
      saveConversations(projectId, updated)
      return updated
    })
    if (activeConversationId === convId) {
      startNewConversation()
    }
  }

  // AI panel visibility
  const [showAI, setShowAI] = React.useState(() => {
    if (typeof window === "undefined") return true
    return window.innerWidth >= 768
  })

  // AI config status
  const [aiConfigured, setAiConfigured] = React.useState(false)

  React.useEffect(() => {
    setAiConfigured(isAIConfigured())
    const handleConfigChange = () => setAiConfigured(isAIConfigured())
    window.addEventListener("ai-config-changed", handleConfigChange)
    return () => window.removeEventListener("ai-config-changed", handleConfigChange)
  }, [])

  // Fetch RAG index status on mount
  React.useEffect(() => {
    fetchIndexStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const fetchIndexStatus = async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      })
      const data = await res.json()
      if (data.status) {
        setIndexStatus(data.status)
        // 如果已有索引，自动开启 RAG
        if (data.status.indexed) setRagEnabled(true)
      }
    } catch {
      // 静默失败
    }
  }

  const fetchSourcesData = async () => {
    setSourcesLoading(true)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sources" }),
      })
      const data = await res.json()
      if (data.files) {
        setSourcesData({ files: data.files, totalChunks: data.totalChunks, totalTokens: data.totalTokens })
      }
    } catch {
      // 静默失败
    } finally {
      setSourcesLoading(false)
    }
  }

  const handleBuildIndex = async () => {
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 API Key")
      return
    }
    setIndexing(true)
    setIndexProgress("准备中...")
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "index",
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
          stream: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast("error", data.error || "索引失败")
        return
      }

      // 读取 SSE 流式进度
      const reader = res.body?.getReader()
      if (!reader) {
        showToast("error", "无法读取响应流")
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue
          try {
            const parsed = JSON.parse(trimmed.slice(6))
            if (parsed.progress) {
              setIndexProgress(parsed.progress)
            }
            if (parsed.done) {
              if (parsed.success) {
                showToast("success", `索引完成：${parsed.totalFiles} 个文件，${parsed.totalChunks} 个文本块`)
                setRagEnabled(true)
                await fetchIndexStatus()
                // 刷新来源面板数据
                if (showSources) fetchSourcesData()
              } else {
                showToast("error", parsed.error || "索引失败")
              }
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch {
      showToast("error", "索引构建失败，请检查网络")
    } finally {
      setIndexing(false)
      setIndexProgress("")
    }
  }

  /**
   * 文件变更后自动触发 RAG 索引重建（后台静默执行）
   * 仅在已配置 API Key 时触发，不阻塞用户操作
   * 带 2 秒防抖：连续文件操作只触发一次索引
   */
  const autoIndexTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAutoIndex = React.useCallback(() => {
    // 清除上一次的定时器（防抖）
    if (autoIndexTimerRef.current) {
      clearTimeout(autoIndexTimerRef.current)
    }

    autoIndexTimerRef.current = setTimeout(() => {
      const config = getAIConfig()
      if (!config) return // 未配置 API Key，跳过

      // 后台静默执行，不设 setIndexing 避免 UI 阻塞
      fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "index",
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setRagEnabled(true)
            fetchIndexStatus()
            // 如果来源面板打开，刷新数据
            if (showSources) fetchSourcesData()
          }
        })
        .catch(() => {
          // 静默失败，不打扰用户
        })
    }, 2000) // 2 秒防抖
  }, [projectId, chatModel])

  // 组件卸载时清理防抖定时器
  React.useEffect(() => {
    return () => {
      if (autoIndexTimerRef.current) {
        clearTimeout(autoIndexTimerRef.current)
      }
    }
  }, [])

  // Toast
  const [toast, setToast] = React.useState<{ type: "success" | "error"; msg: string } | null>(null)

  // ─── Data Fetching ───

  const fetchFiles = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setFiles(data.files || [])
    } catch {
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [projectId])

  React.useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // Auto-select first file when files are loaded
  React.useEffect(() => {
    if (!loadingFiles && files.length > 0 && !activeFile) {
      selectFile(files[0].filename)
    }
  }, [loadingFiles, files])

  const loadFileContent = React.useCallback(async (filename: string) => {
    setLoadingContent(true)
    setEditMode(false)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(filename)}`
      )
      const data = await res.json()
      setFileContent(data.content || "")
      setEditContent(data.content || "")
    } catch {
      setFileContent("")
      setEditContent("")
    } finally {
      setLoadingContent(false)
    }
  }, [projectId])

  const selectFile = (filename: string) => {
    setActiveFile(filename)
    loadFileContent(filename)
  }

  // ─── File Operations ───

  const handleUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    setUploading(true)
    try {
      const formData = new FormData()
      files.forEach((file) => formData.append("file", file))
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        { method: "POST", body: formData }
      )
      const data = await res.json()
      if (res.ok && data.success) {
        const { summary } = data
        if (summary.total === 1) {
          showToast("success", `"${data.title}" 上传成功`)
        } else {
          const msg = summary.failed > 0
            ? `成功 ${summary.success} 个，失败 ${summary.failed} 个`
            : `${summary.success} 个文件上传成功`
          showToast(summary.failed > 0 ? "error" : "success", msg)
        }
        await fetchFiles()
        // Select the first successfully uploaded file
        if (data.results?.length) {
          const first = data.results.find((r: { success: boolean }) => r.success)
          if (first) selectFile(first.filename)
        } else if (data.filename) {
          selectFile(data.filename)
        }
        // 自动更新 RAG 索引
        triggerAutoIndex()
      } else {
        showToast("error", data.error || "上传失败")
      }
    } catch {
      showToast("error", "网络错误")
    } finally {
      setUploading(false)
    }
  }

  const handleCreateFile = async () => {
    const name = newFileName.trim()
    if (!name) return
    const filename = name.endsWith(".md") ? name : `${name}.md`
    const content = `# ${name.replace(/\.md$/, "")}\n\n`

    try {
      const blob = new Blob([content], { type: "text/markdown" })
      const file = new File([blob], filename)
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        { method: "POST", body: formData }
      )
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchFiles()
        selectFile(data.filename)
        setCreatingFile(false)
        setNewFileName("")
        // Auto-enter edit mode for new files
        setEditMode(true)
        setEditContent(content)
        // 自动更新 RAG 索引
        triggerAutoIndex()
      }
    } catch {
      showToast("error", "创建失败")
    }
  }

  const handleImportUrl = async () => {
    const url = importUrl.trim()
    if (!url) return

    setImportingUrl(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/import-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }
      )
      const data = await res.json()
      if (res.ok && data.success) {
        showToast("success", `"${data.title}" 导入成功`)
        await fetchFiles()
        selectFile(data.filename)
        setCreatingFile(false)
        setImportUrl("")
        setCreateMode("file")
        // 自动更新 RAG 索引
        triggerAutoIndex()
      } else {
        showToast("error", data.error || "导入失败")
      }
    } catch {
      showToast("error", "网络错误，导入失败")
    } finally {
      setImportingUrl(false)
    }
  }

  const handleDeleteFile = async () => {
    if (!deleteTarget) return
    const filename = deleteTarget
    setDeleteTarget(null)
    setDeleting(filename)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.filename !== filename))
        if (activeFile === filename) {
          setActiveFile(null)
          setFileContent("")
          setEditContent("")
          setEditMode(false)
        }
        router.refresh()
        // 自动更新 RAG 索引（移除已删除文件的块）
        triggerAutoIndex()
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }

  const handleSave = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      const blob = new Blob([editContent], { type: "text/markdown" })
      const file = new File([blob], activeFile)
      const formData = new FormData()
      formData.append("file", file)
      // Delete old then re-upload
      await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(activeFile)}`,
        { method: "DELETE" }
      )
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        { method: "POST", body: formData }
      )
      if (res.ok) {
        setFileContent(editContent)
        setEditMode(false)
        showToast("success", "已保存")
        await fetchFiles()
        // 自动更新 RAG 索引（文件内容已变更）
        triggerAutoIndex()
      }
    } catch {
      showToast("error", "保存失败")
    } finally {
      setSaving(false)
    }
  }

  // ─── Translate ───

  const handleTranslate = async () => {
    if (!activeFile) return
    setTranslating(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/translate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: activeFile }),
        }
      )
      const data = await res.json()
      if (res.ok && data.content) {
        setFileContent(data.content)
        setEditContent(data.content)
        showToast("success", "翻译完成")
      } else {
        showToast("error", data.error || "翻译失败")
      }
    } catch {
      showToast("error", "翻译失败，请重试")
    } finally {
      setTranslating(false)
    }
  }

  // ─── Drag & Drop ───

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) handleUpload(files)
  }

  // ─── Chat ───

  const streamAI = async (userMessages: ChatMessage[], aiMsgId: string) => {
    const config = getAIConfig()
    if (!config) {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: "请先点击右上角的设置按钮（⚙️），配置 AI 助手的 API Key 后即可开始对话。" }
            : m
        )
      )
      return
    }

    // RAG 查询：如果启用了 RAG 且已索引，先检索相关上下文
    // 多轮上下文感知：综合最近几轮对话构建检索查询，避免代词指代丢失
    let ragSources: ChatMessage["ragSources"] | undefined
    let ragContextText = ""
    const lastUserMsg = userMessages[userMessages.length - 1]

    if (ragEnabled && indexStatus?.indexed && lastUserMsg) {
      try {
        // 取最近 3 轮用户消息，拼接为上下文感知的检索查询
        const recentUserMsgs = userMessages
          .filter((m) => m.role === "user" && m.id !== "welcome")
          .slice(-3)
          .map((m) => m.content)
        // 最后一条消息权重最高，放在最前面；前几轮作为补充上下文
        const contextQuery = recentUserMsgs.length > 1
          ? `${recentUserMsgs[recentUserMsgs.length - 1]}\n\n对话上下文：${recentUserMsgs.slice(0, -1).join("；")}`
          : lastUserMsg.content

        const ragRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "query",
            question: contextQuery,
            apiKey: config.apiKey,
            apiBase: config.apiBase,
            model: chatModel,
          }),
        })
        const ragData = await ragRes.json()
        if (ragData.context?.sources?.length > 0) {
          ragSources = ragData.context.sources
          ragContextText = ragData.context.text
        }
      } catch (err) {
        console.warn("[RAG] Query failed, falling back to plain mode:", err)
      }
    }

    // Build message context — use RAG prompt if we have context, otherwise plain prompt
    const activeFileName = activeFile ? (files.find((f) => f.filename === activeFile)?.title || activeFile) : undefined
    let systemPrompt: string

    if (ragContextText && ragSources && ragSources.length > 0) {
      // 构建 RAG 增强的 system prompt
      const sourceList = ragSources
        .map((s, i) => `  来源 ${i + 1}: ${s.fileTitle}${s.headingPath.length > 0 ? ` > ${s.headingPath.join(" > ")}` : ""}`)
        .join("\n")

      systemPrompt = `你是一个基于文档知识库的 AI 助手。你的回答必须严格遵循以下规则：

## 已检索到的参考资料
以下是从用户笔记本中检索到的相关内容片段：

${ragContextText}

## 来源清单
${sourceList}

${activeFile ? `## 当前打开的文档
用户正在查看「${activeFileName}」，文档内容：
${fileContent}` : ""}

## 回答规范
1. **优先使用检索到的参考资料**回答问题。引用具体内容时，使用 [来源 N] 标注出处。
2. 如果参考资料中没有足够信息回答问题，你可以基于自己的知识补充，但必须明确说明："以下内容不来自笔记本中的文档，建议独立验证。"
3. 如果问题完全无法从参考资料和你的知识中回答，坦诚说明你不确定，而不是编造答案。
4. 回复使用中文。
5. 如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
    } else if (activeFile) {
      systemPrompt = `你是一个笔记 AI 助手。用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}\n\n请基于文档内容回答用户的问题，帮助用户理解、总结、润色或扩展文档内容。回复请使用中文。\n\n【重要】如果用户要求你修改、润色、重写、翻译或编辑文档内容，你需要将修改后的完整文档内容放在 <doc-update> 和 </doc-update> 标签之间。这会自动更新中间区域的文档。在标签之外简要说明你做了什么修改即可。例如：\n我已经帮你润色了文档，主要修改了...\n<doc-update>\n修改后的完整文档内容\n</doc-update>`
    } else {
      systemPrompt = "你是一个笔记 AI 助手。用户还没有选择文档，请友好地引导用户选择一个文档开始工作。回复请使用中文。"
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...userMessages.filter((m) => m.id !== "welcome").map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ]

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: `⚠️ ${data.error || "请求失败，请检查 API 配置。"}` }
              : m
          )
        )
        return
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      if (!reader) {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: "⚠️ 无法读取响应流。" } : m))
        )
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""
      let rafScheduled = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue
          const data = trimmed.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              fullContent += `\n⚠️ ${parsed.error}`
            } else if (parsed.content) {
              fullContent += parsed.content
            }
          } catch {
            // Skip malformed
          }
        }

        // Throttle UI updates via rAF — batch multiple SSE chunks into one React render
        if (!rafScheduled) {
          rafScheduled = true
          const snapshot = fullContent
          requestAnimationFrame(() => {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: snapshot } : m))
            )
            rafScheduled = false
          })
        }
      }

      // Process remaining buffer after stream ends
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
          try {
            const parsed = JSON.parse(trimmed.slice(6))
            if (parsed.error) {
              fullContent += `\n⚠️ ${parsed.error}`
            } else if (parsed.content) {
              fullContent += parsed.content
            }
          } catch {
            // Skip malformed
          }
        }
      }

      // Final update
      if (!fullContent) fullContent = "抱歉，未能获取到回复。"

      // Check if AI response contains a doc-update tag — store as pending, don't auto-apply
      const docUpdateMatch = fullContent.match(/<doc-update>([\s\S]*?)<\/doc-update>/)
      let docUpdate: ChatMessage["docUpdate"] | undefined
      if (docUpdateMatch && activeFile) {
        docUpdate = { content: docUpdateMatch[1].trim(), status: "pending" }
        // Remove the raw doc-update block from the displayed message
        fullContent = fullContent.replace(/<doc-update>[\s\S]*?<\/doc-update>/, "").trim()
      }

      setChatMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullContent, docUpdate, ragSources } : m))
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "网络错误"
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: `⚠️ 请求异常: ${msg}，请检查网络连接和 API 配置。` }
            : m
        )
      )
    }
  }

  const handleSendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    }
    const aiMsgId = `ai-${Date.now()}`
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages([...newMessages, aiMsg])
    setChatInput("")
    setChatLoading(true)
    isStreamingRef.current = true

    await streamAI(newMessages, aiMsgId)
    isStreamingRef.current = false
    setChatLoading(false)
  }

  // Scroll to bottom: instant during streaming, smooth otherwise
  // If the user has scrolled up during streaming, don't force scroll back down
  const isStreamingRef = React.useRef(false)

  const handleChatScroll = React.useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    userScrolledUpRef.current = !atBottom
  }, [])

  React.useEffect(() => {
    if (userScrolledUpRef.current) return
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: isStreamingRef.current ? "instant" : "smooth" })
    }
  }, [chatMessages])

  // Reset scroll lock when streaming ends
  React.useEffect(() => {
    if (!chatLoading && !generating) {
      userScrolledUpRef.current = false
    }
  }, [chatLoading, generating])

  // ─── Doc Update Actions ───

  const handleApplyDocUpdate = async (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.docUpdate || !activeFile) return

    const newContent = msg.docUpdate.content
    // Update the displayed content
    setFileContent(newContent)
    setEditContent(newContent)
    // Save to file
    const blob = new Blob([newContent], { type: "text/markdown" })
    const file = new File([blob], activeFile)
    const formData = new FormData()
    formData.append("file", file)
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(activeFile)}`,
      { method: "DELETE" }
    )
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/files`,
      { method: "POST", body: formData }
    )
    // Mark as applied
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, docUpdate: { ...m.docUpdate!, status: "applied" } } : m
      )
    )
    showToast("success", "文档已更新")
  }

  const handleRejectDocUpdate = (msgId: string) => {
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, docUpdate: { ...m.docUpdate!, status: "rejected" } } : m
      )
    )
    showToast("success", "已退回修改")
  }

  // ─── AI Note Generation ───

  const GENERATE_TEMPLATES = [
    { type: "summary", label: "项目摘要", desc: "全面概括所有文档", icon: IconClipboardText },
    { type: "faq", label: "常见问题", desc: "提炼 Q&A 问答", icon: IconBulb },
    { type: "guide", label: "学习指南", desc: "由浅入深的学习路径", icon: IconNotes },
    { type: "outline", label: "内容大纲", desc: "文档结构提取", icon: IconListDetails },
    { type: "timeline", label: "时间线", desc: "关键事件演进", icon: IconTimeline },
    { type: "briefing", label: "简报文档", desc: "精炼分享给团队", icon: IconMessage },
  ]

  const handleGenerate = async (type: string) => {
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 API Key")
      return
    }

    const templateLabel = GENERATE_TEMPLATES.find((t) => t.type === type)?.label || "AI 生成"
    const aiMsgId = `gen-${Date.now()}`

    // 插入一条用户消息 + 一条空的 AI 消息到聊天区
    const userMsg: ChatMessage = {
      id: `user-gen-${Date.now()}`,
      role: "user",
      content: `生成${templateLabel}`,
      timestamp: new Date(),
    }
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      generateMeta: { type, label: templateLabel, done: false },
    }
    setChatMessages((prev) => [...prev, userMsg, aiMsg])
    setChatLoading(true)
    setGenerating(true)
    isStreamingRef.current = true

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: `⚠️ ${data.error || "生成失败"}`, generateMeta: { type, label: templateLabel, done: true } }
              : m
          )
        )
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: "⚠️ 无法读取响应流", generateMeta: { type, label: templateLabel, done: true } }
              : m
          )
        )
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""
      let rafScheduled = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue
          const data = trimmed.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              fullContent += `\n⚠️ ${parsed.error}`
            } else if (parsed.content) {
              fullContent += parsed.content
            }
          } catch {
            // skip
          }
        }

        // Throttle UI updates via rAF
        if (!rafScheduled) {
          rafScheduled = true
          const snapshot = fullContent
          requestAnimationFrame(() => {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: snapshot } : m))
            )
            rafScheduled = false
          })
        }
      }

      if (!fullContent) fullContent = "未能生成内容，请重试。"

      // Final update — mark as done
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: fullContent, generateMeta: { type, label: templateLabel, done: true } }
            : m
        )
      )
    } catch {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: "⚠️ 网络错误，请重试", generateMeta: { type, label: templateLabel, done: true } }
            : m
        )
      )
    } finally {
      setGenerating(false)
      setChatLoading(false)
      isStreamingRef.current = false
    }
  }

  const handleSaveGenerated = async (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.content) return
    const label = msg.generateMeta?.label || "AI笔记"
    const filename = `${label}-${new Date().toISOString().slice(0, 10)}.md`

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content: msg.content }),
      })
      if (res.ok) {
        showToast("success", `已保存为「${filename}」`)
        await fetchFiles()
      } else {
        showToast("error", "保存失败")
      }
    } catch {
      showToast("error", "保存失败")
    }
  }

  const handleCopyGenerated = async (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.content) return
    try {
      await navigator.clipboard.writeText(msg.content)
      showToast("success", "已复制到剪贴板")
    } catch {
      showToast("error", "复制失败")
    }
  }

  const handleRegenerateGuide = (type: string) => {
    handleGenerate(type)
  }

  const handleRegenerateChat = async (msgId: string) => {
    if (chatLoading || generating) return

    // 找到这条 AI 消息在数组中的位置，取其前面所有消息作为上下文
    const msgIndex = chatMessages.findIndex((m) => m.id === msgId)
    if (msgIndex < 0) return

    const preceding = chatMessages.slice(0, msgIndex)
    const newAiMsgId = `ai-${Date.now()}`
    const newAiMsg: ChatMessage = {
      id: newAiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    }
    // 替换掉旧的 AI 回复
    setChatMessages([...preceding, newAiMsg])
    setChatLoading(true)
    isStreamingRef.current = true

    await streamAI(preceding, newAiMsgId)
    isStreamingRef.current = false
    setChatLoading(false)
  }

  // ─── Audio Overview ───

  const handleAudioGenerate = async () => {
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 API Key")
      return
    }

    setAudioOpen(true)
    setAudioGenerating(true)
    setAudioProgress("准备中...")
    setAudioScript(null)
    setAudioUrl(null)
    setAudioCurrentLine(-1)

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAudioProgress(data.error || "生成失败")
        setAudioGenerating(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setAudioProgress("无法读取响应流")
        setAudioGenerating(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue
          try {
            const parsed = JSON.parse(trimmed.slice(6))
            if (parsed.error) {
              setAudioProgress(parsed.error)
              setAudioGenerating(false)
              return
            }
            if (parsed.progress) {
              setAudioProgress(parsed.progress)
            }
            if (parsed.step === "script_done" && parsed.script) {
              setAudioScript(parsed.script)
            }
            if (parsed.step === "tts_unavailable") {
              setAudioProgress(parsed.message)
            }
            if (parsed.done) {
              if (parsed.hasAudio && parsed.audioUrl) {
                setAudioUrl(parsed.audioUrl)
                setAudioProgress("音频生成完成")
              } else if (parsed.script) {
                setAudioScript(parsed.script)
                setAudioProgress("对话脚本已生成（TTS 不可用，可使用浏览器朗读）")
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      setAudioProgress("网络错误，请重试")
    } finally {
      setAudioGenerating(false)
    }
  }

  const handleAudioPlay = () => {
    if (audioUrl) {
      // 使用真实 TTS 音频
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl)
        audioRef.current.onended = () => {
          setAudioPlaying(false)
          setAudioCurrentLine(-1)
        }
      }
      if (audioPlaying) {
        audioRef.current.pause()
        setAudioPlaying(false)
      } else {
        audioRef.current.play()
        setAudioPlaying(true)
      }
    } else if (audioScript && audioScript.length > 0) {
      // 退化到浏览器原生 SpeechSynthesis
      if (audioPlaying) {
        window.speechSynthesis.cancel()
        setAudioPlaying(false)
        setAudioCurrentLine(-1)
        speechRef.current = null
        return
      }

      setAudioPlaying(true)
      let cancelled = false
      speechRef.current = {
        cancel: () => {
          cancelled = true
          window.speechSynthesis.cancel()
        },
      }

      const speakLine = (index: number) => {
        if (cancelled || index >= audioScript.length) {
          setAudioPlaying(false)
          setAudioCurrentLine(-1)
          return
        }

        setAudioCurrentLine(index)
        const line = audioScript[index]
        const utterance = new SpeechSynthesisUtterance(line.text)
        utterance.lang = "zh-CN"
        utterance.rate = 1.1
        // 用不同的音调区分 host / expert
        utterance.pitch = line.speaker === "host" ? 1.0 : 1.3
        utterance.onend = () => speakLine(index + 1)
        utterance.onerror = () => speakLine(index + 1)
        window.speechSynthesis.speak(utterance)
      }

      speakLine(0)
    }
  }

  const handleAudioStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (speechRef.current) {
      speechRef.current.cancel()
    }
    window.speechSynthesis.cancel()
    setAudioPlaying(false)
    setAudioCurrentLine(-1)
  }

  // 组件卸载时清理音频
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      window.speechSynthesis?.cancel()
    }
  }, [])

  // ─── Toast ───

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2500)
  }

  // ─── Active file title ───

  const activeTitle = activeFile
    ? files.find((f) => f.filename === activeFile)?.title || activeFile.replace(/\.md$/, "")
    : null

  // ─── Word count (memoized) ───

  const currentContent = editMode ? editContent : fileContent
  const wordCount = React.useMemo(
    () => (activeFile ? countWords(currentContent) : null),
    [activeFile, currentContent]
  )

  // ─── Render ───

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full overflow-hidden">
        {/* ─── Left Panel: File Explorer ─── */}
        <div
          className={`relative hidden w-60 shrink-0 flex-col overflow-hidden border-r bg-muted/20 md:flex ${isDragging ? "ring-2 ring-inset ring-primary/50" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Header — same height as center toolbar (px-4 py-2) */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-w-0 max-w-[140px] gap-1.5 px-1.5 text-sm font-medium text-foreground"
              onClick={() => router.push("/docs/projects")}
            >
              <IconChevronLeft className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{projectName}</span>
            </Button>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => {
                      setCreatingFile(true)
                      setNewFileName("")
                    }}
                  >
                    <IconFilePlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建文件</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconUpload className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">上传文件</TooltipContent>
              </Tooltip>
            </div>
          </div>


          {/* File list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="py-1">
              {loadingFiles ? (
                <div className="flex items-center justify-center py-12">
                  <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <div className="px-3 py-12 text-center text-sm text-muted-foreground">
                  {isDragging ? (
                    <p className="font-medium text-primary">松开以上传文件</p>
                  ) : (
                    <>
                      <p>暂无文件</p>
                      <p className="mt-1 text-xs">新建或拖拽文件到此处</p>
                    </>
                  )}
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.filename}
                    className={`group flex items-center px-3 py-2 text-[13px] transition-colors ${
                      activeFile === file.filename
                        ? "border-l-2 border-primary bg-accent text-accent-foreground"
                        : "border-l-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <button
                      onClick={() => selectFile(file.filename)}
                      className="flex min-w-0 flex-1 items-center gap-2"
                    >
                      {getFileIcon(file.filename)}
                      <span className="truncate">{file.title}</span>
                    </button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(file.filename)
                          }}
                          disabled={deleting === file.filename}
                          className="ml-1 shrink-0 p-1 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        >
                          {deleting === file.filename ? (
                            <IconLoader2 className="size-3.5 animate-spin" />
                          ) : (
                            <IconTrash className="size-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">删除</TooltipContent>
                    </Tooltip>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".md,.txt,.json,.yaml,.yml,.csv,.tsv,.xml,.html,.htm,.js,.ts,.jsx,.tsx,.css,.py,.go,.java,.rs,.sh,.toml,.ini,.env,.log,.pdf,.docx,.xlsx,.pptx"
            onChange={(e) => {
              const files = e.target.files
              if (files && files.length > 0) handleUpload(files)
              e.target.value = ""
            }}
            className="hidden"
          />

          {/* Drag overlay hint */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="border-2 border-dashed border-primary/50 px-8 py-5 text-sm font-medium text-primary">
                松开上传
              </div>
            </div>
          )}
        </div>

        {/* ─── Center Panel: Preview / Editor ─── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeFile ? (
            <>
              {/* Editor toolbar */}
              <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Mobile file drawer */}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 md:hidden">
                        <IconFile className="size-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-72 p-0">
                      <SheetHeader className="border-b px-3 py-2 text-left">
                        <SheetTitle className="text-sm">{projectName}</SheetTitle>
                      </SheetHeader>
                      <div className="h-[calc(100vh-4rem)] overflow-y-auto py-1">
                        {files.map((file) => (
                          <div
                            key={file.filename}
                            className={`flex items-center px-3 py-2 text-[13px] transition-colors ${
                              activeFile === file.filename
                                ? "border-l-2 border-primary bg-accent text-accent-foreground"
                                : "border-l-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            }`}
                          >
                            <button
                              onClick={() => selectFile(file.filename)}
                              className="flex min-w-0 flex-1 items-center gap-2"
                            >
                              {getFileIcon(file.filename)}
                              <span className="truncate">{file.title}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </SheetContent>
                  </Sheet>

                  <span className="min-w-0 truncate text-sm font-medium">{activeTitle}</span>
                  {wordCount && (
                    <>
                      <Separator orientation="vertical" className="h-4" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <IconLetterCase className="size-3" />
                            {wordCount.chars} 字
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {wordCount.chars} 字符 · {wordCount.words} 词
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <div className="hidden md:flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={handleTranslate}
                          disabled={translating}
                        >
                          {translating ? (
                            <IconLoader2 className="size-3.5 animate-spin" />
                          ) : (
                            <IconLanguage className="size-3.5" />
                          )}
                          翻译
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>翻译为中文（Bing 翻译）</TooltipContent>
                    </Tooltip>
                    <Separator orientation="vertical" className="h-4" />
                    <Button
                      variant={editMode ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        if (editMode) {
                          setEditContent(fileContent)
                        }
                        setEditMode(!editMode)
                      }}
                    >
                      {editMode ? (
                        <>
                          <IconEye className="size-3.5" />
                          预览
                        </>
                      ) : (
                        <>
                          <IconEdit className="size-3.5" />
                          编辑
                        </>
                      )}
                    </Button>
                    {editMode && (
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={handleSave}
                        disabled={saving || editContent === fileContent}
                      >
                        {saving ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconCheck className="size-3.5" />
                        )}
                        保存
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div className="relative min-h-0 flex-1 overflow-y-auto" id="doc-content-scroll">
                {loadingContent ? (
                  <div className="flex items-center justify-center py-20">
                    <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : editMode ? (
                  <RichTextEditor
                    content={editContent}
                    onChange={(md) => setEditContent(md)}
                    placeholder="开始编辑文档内容..."
                  />
                ) : (
                  <div className="flex">
                    <div className="hidden md:block">
                      <TableOfContents content={fileContent} />
                    </div>
                    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-6 md:py-8">
                      <MarkdownRenderer content={fileContent} />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <IconFile className="mb-3 size-12 opacity-20" />
              <p className="text-sm">选择左侧文件开始阅读或编辑</p>
              <p className="mt-1 text-xs opacity-60">也可以新建或上传文件</p>
            </div>
          )}
        </div>

        {/* ─── Right Panel: AI Chat ─── */}
        {showAI && (
        <div ref={aiPanelRef} className="relative hidden shrink-0 flex-col overflow-hidden border-l bg-background md:flex" style={{ width: aiPanelWidth }}>
          {/* Resize handle */}
          <div
            className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
            onMouseDown={handleResizeStart}
          />
          {/* Chat header */}
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              {showHistory ? (
                <>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowHistory(false)}>
                    <IconArrowLeft className="size-4" />
                  </Button>
                  <span className="text-sm font-medium">历史对话</span>
                </>
              ) : (
                <>
                  <IconSparkles className="size-4 text-primary" />
                  <span className="text-sm font-medium">AI 助手</span>
                  <span className={`size-1.5 rounded-full ${aiConfigured ? "bg-green-500" : "bg-muted-foreground/40"}`} title={aiConfigured ? "已配置" : "未配置 API Key"} />
                </>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {!showHistory && (
                <>
                  {indexStatus?.indexed && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`size-7 ${showSources ? "text-primary" : ""}`}
                          onClick={() => {
                            if (!showSources && !sourcesData) fetchSourcesData()
                            setShowSources((v) => !v)
                          }}
                        >
                          <IconDatabase className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">来源管理</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" onClick={startNewConversation}>
                        <IconPlus className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">新对话</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowHistory(true)}>
                        <IconHistory className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">历史对话</TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowAI(false)}>
                    <IconLayoutSidebarRightCollapse className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">收起</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Sources panel */}
          {showSources ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-medium">来源管理</h4>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => setShowSources(false)}>
                    <IconX className="size-3.5" />
                  </Button>
                </div>
                {sourcesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sourcesData ? (
                  <>
                    <div className="mb-3 flex gap-3 text-[11px] text-muted-foreground">
                      <span>{sourcesData.files.length} 个文件</span>
                      <span>{sourcesData.totalChunks} 个文本块</span>
                      <span>~{Math.round(sourcesData.totalTokens / 1000)}k tokens</span>
                    </div>
                    <div className="space-y-1.5">
                      {sourcesData.files.map((file) => (
                        <Collapsible key={file.filename}>
                          <CollapsibleTrigger className="flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50">
                            <IconFileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{file.fileTitle}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {file.chunkCount} 块 · ~{Math.round(file.totalTokens / 1000)}k tokens
                              </p>
                            </div>
                            <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-x border-b bg-muted/20 px-3 py-2">
                              {file.headings.length > 0 ? (
                                <div className="space-y-0.5">
                                  {file.headings.slice(0, 8).map((h, i) => (
                                    <p key={i} className="truncate text-[11px] text-muted-foreground">{h}</p>
                                  ))}
                                  {file.headings.length > 8 && (
                                    <p className="text-[11px] text-muted-foreground/50">...还有 {file.headings.length - 8} 个标题</p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">无标题结构</p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                    {indexStatus?.lastIndexedAt && (
                      <p className="mt-3 text-[11px] text-muted-foreground/60">
                        上次索引: {new Date(indexStatus.lastIndexedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <IconDatabase className="mb-2 size-8 opacity-30" />
                    <p className="text-sm">尚未建立索引</p>
                  </div>
                )}
              </div>
            </div>
          ) : showHistory ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="p-3">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <IconMessage className="mb-2 size-8 opacity-30" />
                    <p className="text-sm">暂无历史对话</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-2 border px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${conv.id === activeConversationId ? "border-primary/30 bg-primary/5" : "border-border"}`}
                      >
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => loadConversation(conv)}
                        >
                          <IconMessage className="size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{conv.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(conv.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                        >
                          <IconTrash className="size-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
          <>
          {/* Scrollable content area */}
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="min-h-0 flex-1 overflow-y-auto">
            <div className={`p-4 ${chatMessages.length <= 1 && !chatLoading ? "flex h-full flex-col" : ""}`}>
              {/* Welcome & greeting (when no conversation) */}
              {chatMessages.length <= 1 && !chatLoading ? (
                <div className="flex flex-1 flex-col">
                  {/* Centered greeting */}
                  <div className="flex flex-1 flex-col items-center justify-center px-4">
                    <div className="mb-1 flex size-9 items-center justify-center bg-primary/10">
                      <IconSparkles className="size-4 text-primary" />
                    </div>
                    <h3 className="text-[15px] font-medium">有什么可以帮你？</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {projectName}
              </p>
                  </div>

                  {/* 笔记本指南 — AI 生成模板 */}
                  {files.length > 0 && (
                    <div className="space-y-1.5 pb-3">
                      <p className="px-1 text-[11px] text-muted-foreground/70">笔记本指南</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {GENERATE_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.type}
                            className="flex items-center gap-2 border border-border px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-muted/50 disabled:opacity-50"
                            onClick={() => handleGenerate(tpl.type)}
                            disabled={generating}
                          >
                            <tpl.icon className="size-3.5 shrink-0 text-primary/70" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{tpl.label}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{tpl.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                      {/* 音频概述按钮 */}
                      <button
                        className="flex w-full items-center gap-2.5 border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-primary/10 disabled:opacity-50"
                        onClick={handleAudioGenerate}
                        disabled={audioGenerating}
                      >
                        <IconPlayerPlay className="size-3.5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">音频概述</p>
                          <p className="text-[11px] text-muted-foreground">生成 Podcast 风格双人对话，边听边学</p>
                        </div>
                        {audioGenerating && <IconLoader2 className="size-3.5 shrink-0 animate-spin text-primary" />}
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                /* Chat messages */
                <div className="space-y-3">
                  {chatMessages.slice(1).map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "user" ? (
                        <div className="max-w-[85%] px-3 py-2 text-[13px] leading-relaxed bg-primary text-primary-foreground whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="w-full overflow-hidden text-[13px] leading-relaxed [&_article]:max-w-none [&_article]:text-[13px] [&_article]:leading-relaxed [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1.5 [&_p]:leading-relaxed [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:text-xs [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:text-xs [&_blockquote]:my-2 [&_blockquote]:text-[13px] [&_hr]:my-3 [&_table]:text-xs [&_img]:max-w-full">
                          {!msg.content && chatLoading ? (
                            <div className="px-1 py-2">
                              <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <MarkdownRenderer content={msg.content} />
                          )}
                          {/* RAG 引用来源 */}
                          {msg.ragSources && msg.ragSources.length > 0 && (
                            <details className="mt-2 border border-border/50 bg-muted/30 text-xs">
                              <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground">
                                <IconQuote className="size-3" />
                                引用了 {msg.ragSources.length} 个来源
                              </summary>
                              <div className="space-y-1 border-t px-2.5 py-2">
                                {msg.ragSources.map((src, i) => (
                                  <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
                                    <span className="mt-px shrink-0 font-mono text-[10px] text-primary/70">[{i + 1}]</span>
                                    <div className="min-w-0">
                                      <span className="font-medium text-foreground/80">{src.fileTitle}</span>
                                      {src.headingPath.length > 0 && (
                                        <span className="text-muted-foreground/70"> &gt; {src.headingPath.join(" > ")}</span>
                                      )}
                                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">{src.snippet}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          {/* Doc update confirmation buttons */}
                          {msg.docUpdate && (
                            <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                              {msg.docUpdate.status === "pending" && (
                                <>
                                  <span className="flex-1 text-xs text-muted-foreground">AI 建议修改文档内容</span>
                                  <Button
                                    size="sm"
                                    className="h-6 gap-1 text-xs"
                                    onClick={() => handleApplyDocUpdate(msg.id)}
                                  >
                                    <IconCheck className="size-3" />
                                    应用
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 gap-1 text-xs"
                                    onClick={() => handleRejectDocUpdate(msg.id)}
                                  >
                                    <IconX className="size-3" />
                                    退回
                                  </Button>
                                </>
                              )}
                              {msg.docUpdate.status === "applied" && (
                                <span className="text-xs text-green-600">✅ 已应用到文档</span>
                              )}
                              {msg.docUpdate.status === "rejected" && (
                                <span className="text-xs text-muted-foreground">已退回</span>
                              )}
                            </div>
                          )}
                          {/* AI 回复操作按钮 — 所有已完成的 assistant 消息 */}
                          {msg.content && !msg.content.startsWith("⚠️") && !(msg.generateMeta && !msg.generateMeta.done) && !(chatLoading && msg.id === chatMessages[chatMessages.length - 1]?.id) && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 text-[11px]"
                                onClick={() => handleCopyGenerated(msg.id)}
                              >
                                <IconCopy className="size-3" />
                                复制
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 text-[11px]"
                                onClick={() => handleSaveGenerated(msg.id)}
                              >
                                <IconDownload className="size-3" />
                                保存为笔记
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 text-[11px]"
                                onClick={() => msg.generateMeta ? handleRegenerateGuide(msg.generateMeta.type) : handleRegenerateChat(msg.id)}
                                disabled={chatLoading || generating}
                              >
                                <IconRefresh className="size-3" />
                                重新生成
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Index progress bar */}
          {indexing && indexProgress && (
            <div className="shrink-0 border-t bg-muted/30 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <IconLoader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                <span className="truncate text-[11px] text-muted-foreground">{indexProgress}</span>
              </div>
            </div>
          )}

          {/* Bottom input area */}
          <div className="shrink-0 border-t px-3 py-2.5">
            <div className="border border-border bg-background px-3 py-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="输入问题，按 Enter 发送..."
                disabled={chatLoading}
                rows={2}
                className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground/70">
                  {chatModel}{ragEnabled && indexStatus?.indexed ? " · RAG" : ""}
                </span>
                <Button
                  size="icon"
                  className="size-6"
                  onClick={handleSendMessage}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  <IconSend className="size-3" />
                </Button>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
        )}

        {/* AI toggle button (when panel is collapsed) */}
        {!showAI && (
          <div className="hidden shrink-0 flex-col items-center border-l bg-muted/20 px-1.5 py-3 md:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setShowAI(true)}
                >
                  <IconLayoutSidebarRightExpand className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">展开 AI 助手</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ─── Toast ─── */}
        {toast && (
          <div
            className={`fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border px-4 py-2.5 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <IconCheck className="size-4" />
            ) : (
              <IconX className="size-4" />
            )}
            {toast.msg}
          </div>
        )}

        {/* ─── Delete Dialog ─── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除文档</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除「{deleteTarget?.replace(/\.md$/, "")}」吗？此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteFile}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ─── New File Dialog ─── */}
        <Dialog open={creatingFile} onOpenChange={(open) => { if (!open) { setCreatingFile(false); setNewFileName(""); setImportUrl(""); setCreateMode("file") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新建文档</DialogTitle>
            </DialogHeader>
            {/* Tab 切换 */}
            <div className="flex gap-1 border-b">
              <button
                className={`px-3 py-1.5 text-sm transition-colors ${createMode === "file" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setCreateMode("file")}
              >
                空白文档
              </button>
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${createMode === "url" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setCreateMode("url")}
              >
                <IconLink className="size-3.5" />
                从 URL 导入
              </button>
            </div>
            {createMode === "file" ? (
              <div className="py-2">
                <Input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFileName.trim()) handleCreateFile()
                  }}
                  placeholder="输入文件名..."
                  autoFocus
                  className="h-9"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  将自动添加 .md 后缀，支持 Markdown 格式编辑
                </p>
              </div>
            ) : (
              <div className="py-2">
                <Input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && importUrl.trim()) handleImportUrl()
                  }}
                  placeholder="粘贴文章链接，如 https://..."
                  autoFocus
                  className="h-9"
                  disabled={importingUrl}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  自动抓取网页内容并转为 Markdown 文档保存
                </p>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCreatingFile(false); setNewFileName(""); setImportUrl(""); setCreateMode("file") }}
              >
                取消
              </Button>
              {createMode === "file" ? (
                <Button
                  size="sm"
                  onClick={handleCreateFile}
                  disabled={!newFileName.trim()}
                >
                  创建
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleImportUrl}
                  disabled={!importUrl.trim() || importingUrl}
                >
                  {importingUrl ? (
                    <>
                      <IconLoader2 className="mr-1.5 size-3.5 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    "导入"
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* (AI Generate Dialog removed — content now streams inline in chat) */}

        {/* ─── Audio Overview Dialog ─── */}
        <Dialog open={audioOpen} onOpenChange={(open) => { if (!open && !audioGenerating) { handleAudioStop(); setAudioOpen(false) } }}>
          <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconPlayerPlay className="size-4 text-primary" />
                音频概述
                {audioGenerating && <IconLoader2 className="size-3.5 animate-spin text-muted-foreground" />}
              </DialogTitle>
            </DialogHeader>

            {/* 进度提示 */}
            {audioGenerating && (
              <div className="flex items-center gap-2 border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                <IconLoader2 className="size-3.5 animate-spin shrink-0" />
                {audioProgress}
              </div>
            )}

            {/* 对话脚本展示 */}
            {audioScript && audioScript.length > 0 && (
              <div className="min-h-0 flex-1 overflow-y-auto border bg-muted/10 p-3 space-y-2">
                {audioScript.map((line, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 text-[12px] leading-relaxed transition-colors ${
                      audioCurrentLine === i ? "bg-primary/10 -mx-1 px-1 py-0.5" : ""
                    }`}
                  >
                    <span className={`shrink-0 font-medium ${
                      line.speaker === "host" ? "text-blue-600" : "text-emerald-600"
                    }`}>
                      {line.speaker === "host" ? "主持人" : "专  家"}
                    </span>
                    <span className="text-foreground/90">{line.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 播放控制 */}
            {!audioGenerating && audioScript && audioScript.length > 0 && (
              <DialogFooter className="gap-2 sm:gap-1">
                <Button
                  variant={audioPlaying ? "destructive" : "default"}
                  size="sm"
                  className="gap-1.5"
                  onClick={handleAudioPlay}
                >
                  {audioPlaying ? (
                    <><IconX className="size-3.5" />暂停</>
                  ) : (
                    <><IconPlayerPlay className="size-3.5" />{audioUrl ? "播放音频" : "浏览器朗读"}</>
                  )}
                </Button>
                {audioPlaying && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAudioStop}>
                    停止
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { handleAudioStop(); setAudioOpen(false) }}>
                  关闭
                </Button>
              </DialogFooter>
            )}

            {/* 生成失败 / 无脚本 */}
            {!audioGenerating && !audioScript && (
              <DialogFooter>
                <p className="flex-1 text-[12px] text-muted-foreground">{audioProgress || "未能生成内容"}</p>
                <Button variant="outline" size="sm" onClick={() => setAudioOpen(false)}>关闭</Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
