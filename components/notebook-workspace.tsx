"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  IconFile,
  IconLoader2,
  IconCheck,
  IconX,
  IconEdit,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconLanguage,
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { getAIConfig, isAIConfigured, getConfiguredModel } from "@/lib/ai-config"
import { useToast } from "@/hooks/use-toast"
import { ToastContainer } from "@/components/toast-container"
import { ErrorBoundary } from "@/components/error-boundary"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

// ─── Lazy-loaded heavy sub-components ───

const RichTextEditor = dynamic(
  () => import("@/components/rich-text-editor").then((m) => ({ default: m.RichTextEditor })),
  { loading: () => <div className="flex items-center justify-center py-20"><IconLoader2 className="size-5 animate-spin text-muted-foreground" /></div> }
)
const MarkdownRenderer = dynamic(
  () => import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
  { loading: () => <div className="flex items-center justify-center py-20"><IconLoader2 className="size-5 animate-spin text-muted-foreground" /></div> }
)

// ─── Sub-modules (code-split) ───

import type { DocFile, Conversation } from "./notebook/types"
import {
  loadConversations,
  loadConversationsSync,
  loadConversationSummaries,
  loadConversationFromCache,
  saveConversations,
  flushPendingSave,
  migrateLocalToOSS,
  countWords,
  generateConversationTitle,
  WELCOME_MESSAGE,
} from "./notebook/types"
import { useFileCache } from "@/hooks/use-file-cache"
import { usePptFlow } from "@/hooks/use-ppt-flow"
import { useAudioFlow } from "@/hooks/use-audio-flow"
import { useChatFlow } from "@/hooks/use-chat-flow"
import { TableOfContents } from "./notebook/table-of-contents"
import { FileExplorer, MobileFileList } from "./notebook/file-explorer"
import { ReadingModePanel, ReadingModeButton } from "./notebook/reading-mode"
const ChatPanel = dynamic(
  () => import("./notebook/chat-panel").then((m) => ({ default: m.ChatPanel })),
  {
    loading: () => (
      <div className="hidden w-80 shrink-0 items-center justify-center border-l bg-background md:flex">
        <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

// ─── Main Component ───

interface NotebookWorkspaceProps {
  projectId: string
  projectName: string
}

export function NotebookWorkspace({ projectId, projectName }: NotebookWorkspaceProps) {
const router = useRouter()
const searchParams = useSearchParams()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const chatEndRef = React.useRef<HTMLDivElement>(null)
  const chatScrollRef = React.useRef<HTMLDivElement>(null)
  const userScrolledUpRef = React.useRef(false)

  // Project name state — 初始值来自 Server Component prop，
  // 但会在 fetchFiles 时用 API 返回的最新名称覆盖，
  // 避免 Next.js 客户端 Router Cache 导致旧名称回退
  const [currentProjectName, setCurrentProjectName] = React.useState(projectName)

  // File state
  const [files, setFiles] = React.useState<DocFile[]>([])
  const [loadingFiles, setLoadingFiles] = React.useState(true)
  const [activeFile, setActiveFile] = React.useState<string | null>(null)
  const [recentFiles, setRecentFiles] = React.useState<string[]>([])
  const fileCache = useFileCache({ projectId })
  const { fileContent, editContent, setEditContent, loadingContent } = fileCache
  const [uploading, setUploading] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const deleteTargetRef = React.useRef<string | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)

// Editor state
  const [editMode, setEditMode] = React.useState(false)
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

  // Reading mode
  const [readingMode, setReadingMode] = React.useState(false)
  const prevShowAIRef = React.useRef(true)

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

  // AI panel resize
  const [aiPanelWidth, setAiPanelWidth] = React.useState(360)
  const aiPanelRef = React.useRef<HTMLDivElement>(null)

  // Reading mode panel resize
  const [readingPanelWidth, setReadingPanelWidth] = React.useState(320)
  const readingPanelRef = React.useRef<HTMLDivElement>(null)

  // 划词问答
  const [selectedText, setSelectedText] = React.useState("")
  const docContentRef = React.useRef<HTMLDivElement>(null)

  // 监听文档区域的划词事件
  React.useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return // 选区消失时不清除，保留已有划词
      const range = selection.getRangeAt(0)
      const container = docContentRef.current
      if (!container) return
      // 仅当选区在文档内容区域内时才捕获
      if (container.contains(range.commonAncestorContainer)) {
        const text = selection.toString().trim()
        if (text.length > 0) {
          setSelectedText(text)
        }
      }
    }
    document.addEventListener("mouseup", handleSelection)
    return () => document.removeEventListener("mouseup", handleSelection)
  }, [])

  // 切换文件时清除划词
  React.useEffect(() => {
    setSelectedText("")
  }, [activeFile])

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

  // Reading mode panel resize handler
  const handleReadingResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = readingPanelRef.current?.offsetWidth ?? 320
    let rafId: number | null = null
    let latestWidth = startWidth

    const handleMouseMove = (ev: MouseEvent) => {
      // 向左拖拽增大宽度（面板在右侧）
      const delta = startX - ev.clientX
      latestWidth = Math.min(Math.max(startWidth + delta, 260), 600)
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (readingPanelRef.current) {
            readingPanelRef.current.style.width = `${latestWidth}px`
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
      setReadingPanelWidth(latestWidth)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])


  // Conversation history
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)

React.useEffect(() => {
// Instant load from localStorage cache (full data, for immediate use)
const cached = loadConversationsSync(projectId)
setConversations(cached)
// Then fetch summaries from OSS (lightweight — no message content)
loadConversationSummaries(projectId).then(async (summaries) => {
  if (summaries.length > 0) {
    // Check if we need to fetch full data for any conversation
    // If cache is stale (different IDs or count), fetch full data
    const cachedIds = new Set(cached.map((c) => c.id))
    const summaryIds = new Set(summaries.map((s) => s.id))
    const needsFullFetch =
      cached.length !== summaries.length ||
      summaries.some((s) => !cachedIds.has(s.id)) ||
      cached.some((c) => !summaryIds.has(c.id))

    if (needsFullFetch) {
      // Fetch full conversations (one-time, to populate cache)
      const fullConvs = await loadConversations(projectId)
      setConversations(fullConvs)
    }
    // If cache is up-to-date, we already have full data from localStorage
  } else if (cached.length > 0) {
    // OSS is empty but localStorage has data → migrate
    migrateLocalToOSS(projectId)
  }
})
}, [projectId])

  // Flush pending saves and warn about unsaved edits on page unload
  const conversationsRef = React.useRef(conversations)
  const editModeRef = React.useRef(false)
  const editContentRef = React.useRef("")
  const fileContentRef = React.useRef("")
  // 在 effect 中同步 ref 值，避免在 render 阶段修改 ref（lint: refs-during-render）
  React.useEffect(() => {
    conversationsRef.current = conversations
    editModeRef.current = editMode
    editContentRef.current = editContent
    fileContentRef.current = fileContent
  })
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (conversationsRef.current.length > 0) {
        flushPendingSave(projectId, conversationsRef.current)
      }
      // Warn user if there are unsaved edits
      if (editModeRef.current && editContentRef.current !== fileContentRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [projectId])

  // AI panel visibility
  const [showAI, setShowAI] = React.useState(() => {
    if (typeof window === "undefined") return true
    return window.innerWidth >= 768
  })

  const toggleReadingMode = React.useCallback((forceOff?: boolean) => {
    setReadingMode((prev) => {
      const next = forceOff ? false : !prev
      if (next && !prev) {
        prevShowAIRef.current = showAI
        setShowAI(false)
      } else if (!next && prev) {
        setShowAI(prevShowAIRef.current)
      }
      return next
    })
  }, [showAI])

  // AI config
  const [aiConfigured, setAiConfigured] = React.useState(false)

  React.useEffect(() => {
    setAiConfigured(isAIConfigured())
    const handleConfigChange = () => setAiConfigured(isAIConfigured())
    window.addEventListener("ai-config-changed", handleConfigChange)
    return () => window.removeEventListener("ai-config-changed", handleConfigChange)
  }, [])

  // Toast (professional queue system with animations) — 前置声明以供 fetchIndexStatus/fetchSourcesData 使用
  const { toasts, showToast, removeToast } = useToast()

  // Fetch RAG index status
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
        if (data.status.indexed) setRagEnabled(true)
      }
    } catch (err) {
      console.warn("[fetchIndexStatus]", err)
      // 索引状态查询为后台操作，仅记录日志不打扰用户
    }
  }

  // Fetch RAG index status on mount
  React.useEffect(() => {
    fetchIndexStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

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
    } catch (err) {
      console.warn("[fetchSourcesData]", err)
      showToast("error", "知识源数据加载失败")
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

      const reader = res.body?.getReader()
      if (!reader) {
        showToast("error", "无法读取响应流")
        return
      }

      // 使用统一的 SSE 流解析工具（消除手写缓冲逻辑）
      const { parseSSEStream } = await import("@/lib/infra/stream-utils")

      for await (const event of parseSSEStream(reader)) {
        if (typeof event.progress === "string") {
          setIndexProgress(event.progress)
        }
        if (event.done === true) {
          if (event.success === true) {
            showToast("success", `索引完成：${event.totalFiles} 个文件，${event.totalChunks} 个文本块`)
            setRagEnabled(true)
            await fetchIndexStatus()
            if (showSources) fetchSourcesData()
          } else {
            const errMsg = typeof event.error === "string" ? event.error : "索引失败"
            showToast("error", errMsg)
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

  // Auto-index on file changes
  const autoIndexTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAutoIndex = React.useCallback(() => {
    if (autoIndexTimerRef.current) {
      clearTimeout(autoIndexTimerRef.current)
    }

    autoIndexTimerRef.current = setTimeout(() => {
      const config = getAIConfig()
      if (!config) return

      fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "index",
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: getConfiguredModel(),
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setRagEnabled(true)
            fetchIndexStatus()
            if (showSources) fetchSourcesData()
          }
        })
        .catch((err: unknown) => {
          console.warn("[autoIndex]", err)
        })
    }, 2000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  React.useEffect(() => {
    return () => {
      if (autoIndexTimerRef.current) {
        clearTimeout(autoIndexTimerRef.current)
      }
    }
  }, [])

  // ─── Data Fetching (moved before useChatFlow which depends on fetchFiles) ───

  const fetchFiles = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setFiles(data.files || [])
      // 用 API 返回的最新名称覆盖，防止 Router Cache 缓存了旧名称
      if (data.project?.name) {
        setCurrentProjectName(data.project.name)
      }
    } catch (err) {
      console.error("[fetchFiles] Failed:", err)
      setFiles([])
      showToast("error", "文件列表加载失败，请刷新重试")
    } finally {
      setLoadingFiles(false)
    }
  }, [projectId, showToast])

  React.useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // ─── Refs to break circular dependency between useChatFlow ↔ usePptFlow ───
  const pptSessionRef = React.useRef<{ active: boolean } | null>(null)
  const pptAbortRef = React.useRef<AbortController | null>(null)
  const startPptFlowRef = React.useRef<((text: string) => void) | null>(null)

  // ─── AI Chat Flow (via hook) ───
  const chatFlow = useChatFlow({
    projectId,
    activeFile,
    files,
    fileContent,
    ragEnabled,
    indexStatus,
    selectedText,
    setSelectedText,
    pptSessionRef,
    pptAbortRef,
    startPptFlowRef,
    showToast,
    fetchFiles,
  })
  const {
    chatMessages, setChatMessages, chatInput, setChatInput,
    chatLoading, setChatLoading, chatModel, providerList, deepThinkMode, generating,
    isStreamingRef,
    handleSendMessage, handleStopGeneration, handleSwitchProvider,
    handleToggleDeepThink, handleGenerate, handleSaveGenerated,
    handleCopyGenerated, handleRegenerateGuide, handleRegenerateChat,
  } = chatFlow

  // ─── PPT Generation (via hook) ───
  const pptFlow = usePptFlow({
    projectId,
    ragEnabled,
    chatMessages,
    setChatMessages,
    setChatLoading: (v: boolean) => setChatLoading(v),
    chatEndRef,
    showToast,
  })
  const { pptSession, setPptSession } = pptFlow

  // 在 effect 中同步 ref 值，避免在 render 阶段修改 ref（lint: refs-during-render）
  React.useEffect(() => {
    pptSessionRef.current = pptSession
    pptAbortRef.current = pptFlow.pptAbortRef.current
    startPptFlowRef.current = pptFlow.startPptFlow
  })

  // ─── Audio Overview (via hook) ───
  const audioFlow = useAudioFlow({
    projectId,
    chatModel,
    chatMessages,
    setChatMessages,
    setChatLoading: (v: boolean) => setChatLoading(v),
    showToast,
  })
  const { audioGenerating, audioPlaying } = audioFlow

  // Save current conversation (must be after useChatFlow which provides chatMessages)
  const savePendingRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeConvIdRef = React.useRef(activeConversationId)
  const chatMessagesRef = React.useRef(chatMessages)
  // 在 effect 中同步 ref 值，避免在 render 阶段修改 ref（lint: refs-during-render）
  React.useEffect(() => {
    activeConvIdRef.current = activeConversationId
    chatMessagesRef.current = chatMessages
  })

  React.useEffect(() => {
    if (chatMessages.length <= 1) return

    if (savePendingRef.current) clearTimeout(savePendingRef.current)
    savePendingRef.current = setTimeout(() => {
      const currentMessages = chatMessagesRef.current
      const currentConvId = activeConvIdRef.current
      const now = new Date().toISOString()
      const firstUserMsg = currentMessages.find((m) => m.role === "user")
      const title = firstUserMsg ? generateConversationTitle(firstUserMsg.content) : "新对话"

      setConversations((prev) => {
        let updated: Conversation[]
        if (currentConvId) {
          updated = prev.map((c) =>
            c.id === currentConvId
              ? { ...c, messages: currentMessages, title, updatedAt: now }
              : c
          )
        } else {
          const newId = `conv-${Date.now()}`
          setActiveConversationId(newId)
          updated = [{ id: newId, title, messages: currentMessages, createdAt: now, updatedAt: now }, ...prev]
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

  // ─── Conversation Management (must be after hook destructuring) ───

  const startNewConversation = () => {
    handleStopGeneration()
    setPptSession(null)
    setActiveConversationId(null)
    setChatMessages([WELCOME_MESSAGE])
    setShowHistory(false)
  }

const loadConversation = (conv: Conversation) => {
if (pptAbortRef.current) {
pptAbortRef.current.abort()
pptAbortRef.current = null
}
// If the conversation has no messages (summary-only), try to load full data
let fullConv = conv
if ((!conv.messages || conv.messages.length === 0) && conv.id) {
  const cached = loadConversationFromCache(projectId, conv.id)
  if (cached) fullConv = cached
}
setActiveConversationId(fullConv.id)
setChatMessages(fullConv.messages?.length > 0 ? fullConv.messages : [WELCOME_MESSAGE])
setShowHistory(false)
// Restore PPT session from last PPT message
const lastPptMsg = [...(fullConv.messages || [])].reverse().find((m) => m.pptMeta)
    if (lastPptMsg?.pptMeta && lastPptMsg.pptMeta.step !== "done" && lastPptMsg.pptMeta.step !== "error") {
      const pm = lastPptMsg.pptMeta
      setPptSession({
        active: false,
        step: pm.step as "style-select" | "slide-count" | "custom-prompt" | "generating-outline" | "outline-review" | "generating-images" | "done",
        stylePreset: pm.stylePreset || "corporate",
        slideCount: pm.slideCount || 8,
        customPrompt: pm.customPrompt || "",
        userIntent: pm.userIntent || "",
        outlineMsgId: null,
        imagesMsgId: null,
      })
    } else {
      setPptSession(null)
    }
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

  // Track whether editor has unsaved changes (用于退出编辑模式时判断是否需要确认)
  const [cancelEditConfirm, setCancelEditConfirm] = React.useState(false)

  const [pendingFileSwitch, setPendingFileSwitch] = React.useState<string | null>(null)

  const selectFile = React.useCallback((filename: string) => {
    // If switching files while editing with unsaved changes, ask for confirmation
    if (editMode && editContent !== fileContent) {
      setPendingFileSwitch(filename)
      return
    }
    setActiveFile(filename)
    setEditMode(false)
    fileCache.loadFileContent(filename)
    // 添加到最近打开列表
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f !== filename)
      return [filename, ...filtered].slice(0, 10) // 最多保留10个
    })
  }, [fileCache.loadFileContent, editMode, editContent, fileContent])

React.useEffect(() => {
if (!loadingFiles && files.length > 0 && !activeFile) {
const fileParam = searchParams.get("file")
const target = fileParam && files.some(f => f.filename === fileParam) ? fileParam : files[0].filename
selectFile(target)
}
}, [loadingFiles, files]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── File Operations ───

  const handleUpload = React.useCallback(async (fileList: FileList | File[]) => {
    const uploadFiles = Array.from(fileList)
    if (uploadFiles.length === 0) return

    setUploading(true)
    try {
      const formData = new FormData()
      uploadFiles.forEach((file) => formData.append("file", file))
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
        if (data.results?.length) {
          const first = data.results.find((r: { success: boolean }) => r.success)
          if (first) selectFile(first.filename)
        } else if (data.filename) {
          selectFile(data.filename)
        }
        triggerAutoIndex()
      } else {
        showToast("error", data.error || "上传失败")
      }
    } catch {
      showToast("error", "网络错误")
    } finally {
      setUploading(false)
    }
  }, [projectId, selectFile, fetchFiles, showToast, triggerAutoIndex])

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
        setEditMode(true)
        setEditContent(content)
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
    const filename = deleteTargetRef.current
    if (!filename) return
    deleteTargetRef.current = null
    setDeleteTarget(null)
    setDeleting(filename)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${filename
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.filename !== filename))
        if (activeFile === filename) {
          setActiveFile(null)
          setEditMode(false)
        }
        setRecentFiles((prev) => prev.filter((f) => f !== filename))
        fileCache.invalidate(filename)
        router.refresh()
        triggerAutoIndex()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast("error", data.error || "删除失败，请重试")
      }
    } catch {
      showToast("error", "网络错误，删除失败")
    } finally {
      setDeleting(null)
    }
  }

  const handleSave = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${activeFile
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent }),
        }
      )
      if (res.ok) {
        fileCache.setFileContent(activeFile, editContent)
        setEditMode(false)
        showToast("success", "已保存")
        await fetchFiles()
        triggerAutoIndex()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast("error", data.error || "保存失败")
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
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 AI 助手的 API Key")
      return
    }
    setTranslating(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/translate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: activeFile,
            apiKey: config.apiKey,
            apiBase: config.apiBase,
            model: chatModel,
          }),
        }
      )
      const data = await res.json()
      if (res.ok && data.content) {
        fileCache.setFileContent(activeFile, data.content)
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

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])
  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) handleUpload(droppedFiles)
  }, [handleUpload])

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
    fileCache.setFileContent(activeFile, newContent)

    // 使用 PUT 原子更新替代之前的 DELETE + POST 两步操作
    // 避免竞态条件：若 DELETE 成功但 POST 失败，文件会丢失
    // 发送 JSON body（与 PUT route handler 的 request.json() 匹配）
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${activeFile
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newContent }),
        }
      )
      if (!res.ok) {
        // PUT 失败时回退：不更新 UI 状态
        const data = await res.json().catch(() => ({}))
        showToast("error", `更新失败: ${data.error || "未知错误"}`)
        return
      }
    } catch {
      showToast("error", "网络错误，文档更新失败")
      return
    }

    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, docUpdate: { ...m.docUpdate!, status: "applied" } } : m
      )
    )
    showToast("success", "文档已更新")
    await fetchFiles()
    triggerAutoIndex()
  }

  const handleRejectDocUpdate = (msgId: string) => {
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, docUpdate: { ...m.docUpdate!, status: "rejected" } } : m
      )
    )
    showToast("success", "已退回修改")
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

  // ─── Shared file operation props ───

  // ─── Render ───

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full overflow-hidden">
        {/* ─── Left Panel: File Explorer ─── */}
        {!readingMode && <FileExplorer
          projectName={currentProjectName}
          files={files}
          loadingFiles={loadingFiles}
          activeFile={activeFile}
          uploading={uploading}
          isDragging={isDragging}
          deleting={deleting}
          fileInputRef={fileInputRef}
          recentFiles={recentFiles}
          onBack={() => router.push("/docs/projects")}
          onSelectFile={selectFile}
          onDeleteRequest={(filename: string) => {
            deleteTargetRef.current = filename
            setDeleteTarget(filename)
          }}
          onCreateFile={() => { setCreatingFile(true); setNewFileName(""); setCreateMode("file") }}
          onUploadClick={() => fileInputRef.current?.click()}
          onUpload={handleUpload}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />}

        {/* ─── Center: Document Viewer / Editor ─── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <div className="flex items-center justify-between border-b px-3 py-2 md:hidden">
            {readingMode ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => toggleReadingMode(true)}
              >
                <IconX className="size-4" />
                退出精读
              </Button>
            ) : (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <IconFile className="size-4" />
                    <span className="max-w-[120px] truncate">{activeTitle || "选择文件"}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <MobileFileList
                    projectName={currentProjectName}
                    files={files}
                    activeFile={activeFile}
                    deleting={deleting}
                    recentFiles={recentFiles}
                    onSelectFile={selectFile}
                    onDeleteRequest={(filename: string) => {
                      deleteTargetRef.current = filename
                      setDeleteTarget(filename)
                    }}
                  />
                </SheetContent>
              </Sheet>
            )}
            {activeFile && !editMode && !readingMode && (
              <ReadingModeButton
                active={readingMode}
                onClick={() => toggleReadingMode()}
              />
            )}
            {!readingMode && (
              <Button variant="ghost" size="sm" onClick={() => setShowAI(!showAI)}>
                <IconLayoutSidebarRightExpand className="size-4" />
              </Button>
            )}
          </div>

          {/* Mobile reading mode panel */}
          {activeFile && !editMode && fileContent && readingMode && (
            <div className="border-b md:hidden">
              <div className="h-[50vh]">
                <ReadingModePanel
                  content={fileContent}
                  fileKey={`${projectId}/${activeFile}`}
                  scrollContainerRef={docContentRef}
                  onClose={() => toggleReadingMode(true)}
                />
              </div>
            </div>
          )}

          {/* Desktop header */}
          <div className={`items-center justify-between border-b px-4 py-2 ${activeFile ? "hidden md:flex" : "hidden"}`}>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium">{activeTitle || "未选择文件"}</h2>
              {wordCount && (
                <span className="text-[11px] text-muted-foreground">{wordCount.words} 字</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeFile && readingMode ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => toggleReadingMode(true)}
                >
                  <IconX className="size-3.5" />
                  退出精读
                </Button>
              ) : activeFile ? (
                <>
                  {!editMode && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => setEditMode(true)}
                        >
                          <IconEdit className="size-3.5" />
                          编辑
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>切换到编辑模式</TooltipContent>
                    </Tooltip>
                  )}
                  {editMode && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCheck className="size-3.5" />}
                        保存
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => {
                          if (editContent !== fileContent) {
                            setCancelEditConfirm(true)
                            return
                          }
                          setEditContent(fileContent)
                          setEditMode(false)
                        }}
                      >
                        <IconX className="size-3.5" />
                        取消
                      </Button>
                    </>
                  )}
                  {!editMode && (
                    <>
                      <ReadingModeButton
                        active={readingMode}
                        onClick={() => toggleReadingMode()}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={handleTranslate}
                            disabled={translating}
                          >
                            {translating ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconLanguage className="size-3.5" />}
                            翻译
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>翻译为中文</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </>
              ) : null}
              {!showAI && !readingMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => setShowAI(true)}>
                      <IconLayoutSidebarRightExpand className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>打开 AI 助手</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {activeFile && !editMode && fileContent && (
              <TableOfContents content={fileContent} />
            )}
            <div id="doc-content-scroll" ref={docContentRef} className={`min-w-0 flex-1 overflow-y-auto ${readingMode && !editMode ? "reading-mode-active" : ""}`}>
              {loadingContent ? (
                <div className="mx-auto max-w-5xl p-6">
                  <Skeleton className="mb-4 h-7 w-2/3" />
                  <Skeleton className="mb-6 h-px w-full" />
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[85%]" />
                        <Skeleton className="h-4 w-[70%]" />
                      </div>
                    ))}
                  </div>
                  <Skeleton className="mt-6 mb-3 h-5 w-1/3" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[60%]" />
                  </div>
                </div>
              ) : !activeFile ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <IconFile className="mb-2 size-8 opacity-30" />
                  <p className="text-sm">选择一个文件开始阅读</p>
                </div>
              ) : editMode ? (
                <ErrorBoundary section="编辑器">
                  <div className="h-full p-4">
                    <RichTextEditor content={editContent} onChange={setEditContent} />
                  </div>
                </ErrorBoundary>
              ) : (
                <ErrorBoundary section="文档渲染">
                  <div className="mx-auto max-w-5xl p-6">
                    <MarkdownRenderer content={fileContent} />
                  </div>
                </ErrorBoundary>
              )}
            </div>
              {/* Reading mode panel */}
              {activeFile && !editMode && fileContent && readingMode && (
                <div
                  ref={readingPanelRef}
                  className="relative hidden shrink-0 border-l md:block"
                  style={{ width: readingPanelWidth }}
                >
                  {/* Drag handle */}
                  <div
                    className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
                    onMouseDown={handleReadingResizeStart}
                  />
                  <ReadingModePanel
                    content={fileContent}
                    fileKey={`${projectId}/${activeFile}`}
                    scrollContainerRef={docContentRef}
                    onClose={() => toggleReadingMode(true)}
                  />
                </div>
              )}
          </div>
        </div>

        {/* ─── Right: AI Chat Panel ─── */}
        <ErrorBoundary section="AI 助手">
        <ChatPanel
          projectName={currentProjectName}
          projectId={projectId}
          files={files}
          activeFile={activeFile}
          fileContent={fileContent}
          chatMessages={chatMessages}
          chatInput={chatInput}
          chatLoading={chatLoading}
          chatModel={chatModel}
          providerList={providerList}
          onSwitchProvider={handleSwitchProvider}
          deepThinkMode={deepThinkMode}
          conversations={conversations}
          activeConversationId={activeConversationId}
          showHistory={showHistory}
          aiConfigured={aiConfigured}
          showAI={showAI}
          ragEnabled={ragEnabled}
          indexStatus={indexStatus}
          indexing={indexing}
          indexProgress={indexProgress}
          showSources={showSources}
          sourcesData={sourcesData}
          sourcesLoading={sourcesLoading}
          generating={generating}
          audioGenerating={audioGenerating}
          audioPlaying={audioPlaying}
          aiPanelWidth={aiPanelWidth}
          aiPanelRef={aiPanelRef}
          chatScrollRef={chatScrollRef}
          chatEndRef={chatEndRef}
          onResizeStart={handleResizeStart}
          onSetShowHistory={setShowHistory}
          onSetShowAI={setShowAI}
          onSetShowSources={setShowSources}
          onSetChatInput={setChatInput}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onToggleDeepThink={handleToggleDeepThink}
          selectedText={selectedText}
          onClearSelectedText={() => setSelectedText("")}
          onStartNewConversation={startNewConversation}
          onLoadConversation={loadConversation}
          onDeleteConversation={deleteConversation}
          onFetchSourcesData={fetchSourcesData}
          onChatScroll={handleChatScroll}
          onBuildIndex={handleBuildIndex}
          onGenerate={handleGenerate}
          onSaveGenerated={handleSaveGenerated}
          onCopyGenerated={handleCopyGenerated}
          onRegenerateGuide={handleRegenerateGuide}
          onRegenerateChat={handleRegenerateChat}
          onApplyDocUpdate={handleApplyDocUpdate}
          onRejectDocUpdate={handleRejectDocUpdate}
          onAudioGenerate={audioFlow.handleAudioGenerate}
          onAudioConfirm={audioFlow.handleAudioConfirm}
          onAudioPlay={audioFlow.handleAudioPlay}
          onAudioStop={audioFlow.handleAudioStop}
          // PPT conversational flow
          pptSession={pptSession}
          onPptStyleSelect={pptFlow.handlePptStyleSelect}
          onPptSlideCountSelect={pptFlow.handlePptSlideCountSelect}
          onPptStartOutline={pptFlow.handlePptStartOutline}
          onPptConfirmOutline={pptFlow.handlePptConfirmOutline}
          onPptRetrySlide={pptFlow.handlePptRetrySlide}
          onPptRegenerateOutline={pptFlow.handlePptRegenerateOutline}
          onPptGuideClick={() => pptFlow.startPptFlow(selectedText ? `基于选中内容生成 PPT：${selectedText.slice(0, 100)}` : "生成 PPT")}
          onPptCancel={pptFlow.handlePptCancel}
        />
        </ErrorBoundary>
      </div>

      {/* ─── Unsaved Changes Confirmation Dialog ─── */}
      <AlertDialog
        open={!!pendingFileSwitch}
        onOpenChange={(open) => {
          if (!open) setPendingFileSwitch(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的更改</AlertDialogTitle>
            <AlertDialogDescription>
              当前文件有未保存的编辑内容，切换文件将丢失这些更改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingFileSwitch
                setPendingFileSwitch(null)
                if (target) {
                  setEditContent(fileContent)
                  setActiveFile(target)
                  setEditMode(false)
                  fileCache.loadFileContent(target)
                  setRecentFiles((prev) => {
                    const filtered = prev.filter((f) => f !== target)
                    return [target, ...filtered].slice(0, 10)
                  })
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              放弃更改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            deleteTargetRef.current = null
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Cancel Edit Confirmation Dialog ─── */}
      <AlertDialog
        open={cancelEditConfirm}
        onOpenChange={setCancelEditConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃编辑</AlertDialogTitle>
            <AlertDialogDescription>
              有未保存的编辑内容，确定要放弃吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCancelEditConfirm(false)
                setEditContent(fileContent)
                setEditMode(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              放弃更改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Create File / Import URL Dialog ─── */}
      <Dialog open={creatingFile} onOpenChange={setCreatingFile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant={createMode === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setCreateMode("file")}
            >
              新建文件
            </Button>
            <Button
              variant={createMode === "url" ? "default" : "outline"}
              size="sm"
              onClick={() => setCreateMode("url")}
            >
              导入 URL
            </Button>
          </div>
          {createMode === "file" ? (
            <div className="space-y-3">
              <Input
                placeholder="输入文件名（不需要扩展名）"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFile() }}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreatingFile(false)}>取消</Button>
                <Button onClick={handleCreateFile} disabled={!newFileName.trim()}>创建</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder="输入网页 URL"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreatingFile(false)}>取消</Button>
                <Button onClick={handleImportUrl} disabled={!importUrl.trim() || importingUrl}>
                  {importingUrl ? <IconLoader2 className="mr-1 size-4 animate-spin" /> : <IconLink className="mr-1 size-4" />}
                  导入
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Toast Queue ─── */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </TooltipProvider>
  )
}