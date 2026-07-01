"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  IconFile,
  IconLoader2,
  IconCheck,
  IconX,
  IconEye,
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
import { getAIConfig, getTTSConfig, isAIConfigured, getConfiguredModel } from "@/components/settings-dialog"
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

import type { DocFile, ChatMessage, Conversation } from "./notebook/types"
import {
  loadConversations,
  saveConversations,
  countWords,
  WELCOME_MESSAGE,
} from "./notebook/types"
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
  const [fileContent, setFileContent] = React.useState("")
  const [loadingContent, setLoadingContent] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const deleteTargetRef = React.useRef<string | null>(null)
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

  // AI note generation
  const [generating, setGenerating] = React.useState(false)

  // Audio overview
  const [audioGenerating, setAudioGenerating] = React.useState(false)
  const [audioPlaying, setAudioPlaying] = React.useState(false)
  const [audioCurrentLine, setAudioCurrentLine] = React.useState(-1)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const speechRef = React.useRef<{ cancel: () => void } | null>(null)

  // AI panel resize
  const [aiPanelWidth, setAiPanelWidth] = React.useState(320)
  const aiPanelRef = React.useRef<HTMLDivElement>(null)

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

  // Chat state
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [chatInput, setChatInput] = React.useState("")
  const [chatLoading, setChatLoading] = React.useState(false)
  const [chatModel, setChatModel] = React.useState("gpt-4o-mini")
  const [deepThinkMode, setDeepThinkMode] = React.useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("ai-deep-think-mode") === "true"
  })

  React.useEffect(() => {
    localStorage.setItem("ai-deep-think-mode", String(deepThinkMode))
  }, [deepThinkMode])

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

  React.useEffect(() => {
    setConversations(loadConversations(projectId))
  }, [projectId])

  // Save current conversation
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
    // 中断正在进行的流式请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    isStreamingRef.current = false
    setChatLoading(false)
    setGenerating(false)
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
          model: chatModel,
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
        .catch(() => {})
    }, 2000)
  }, [projectId, chatModel])

  React.useEffect(() => {
    return () => {
      if (autoIndexTimerRef.current) {
        clearTimeout(autoIndexTimerRef.current)
      }
    }
  }, [])

  // Toast
  const [toast, setToast] = React.useState<{ type: "success" | "error"; msg: string } | null>(null)

  const showToast = React.useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2500)
  }, [])

  // ─── Data Fetching ───

  const fetchFiles = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setFiles(data.files || [])
      // 用 API 返回的最新名称覆盖，防止 Router Cache 缓存了旧名称
      if (data.project?.name) {
        setCurrentProjectName(data.project.name)
      }
    } catch {
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [projectId])

  React.useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

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

  const selectFile = React.useCallback((filename: string) => {
    setActiveFile(filename)
    loadFileContent(filename)
  }, [loadFileContent])

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
        triggerAutoIndex()
      } else {
        const data = await res.json().catch(() => ({}))
        setToast({ type: "error", msg: data.error || "删除失败，请重试" })
      }
    } catch {
      setToast({ type: "error", msg: "网络错误，删除失败" })
    } finally {
      setDeleting(null)
    }
  }

  const handleSave = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      // 从内容第一行提取新文件名（不含扩展名）
      const ext = activeFile.includes(".") ? activeFile.slice(activeFile.lastIndexOf(".")) : ""
      const firstLine = editContent.trim().split("\n")[0]?.trim() || ""
      const newTitle = firstLine
        .replace(/^#{1,6}\s*/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/\[(.+?)\]\(.+?\)/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .trim() || activeFile.replace(/\.[^.]+$/, "")
      // 清理文件名中的非法字符
      const safeTitle = newTitle.replace(/[\/\\:*?"<>|]/g, "_").slice(0, 100)
      const newFilename = safeTitle + ext

      const blob = new Blob([editContent], { type: "text/markdown" })
      const file = new File([blob], newFilename)
      const formData = new FormData()
      formData.append("file", file)

      // 如果文件名变了，先删除旧文件再上传新文件
      if (newFilename !== activeFile) {
        await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(activeFile)}`,
          { method: "DELETE" }
        )
      }
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        { method: "POST", body: formData }
      )
      if (res.ok) {
        setFileContent(editContent)
        setEditMode(false)
        if (newFilename !== activeFile) {
          setActiveFile(newFilename)
          // 静默更新 URL，不触发路由导航
          const newUrl = `/docs/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(newFilename)}`
          window.history.replaceState(null, "", newUrl)
        }
        showToast("success", "已保存")
        await fetchFiles()
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

  // ─── Web Search (Agent Reach) ───

  /** 检测用户消息是否需要互联网搜索 */
  const detectWebIntent = (text: string): { action: string; query?: string; url?: string } | null => {
    const trimmed = text.trim()

    // 1. 检测 URL（优先级最高）
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/)
    if (urlMatch) {
      const url = urlMatch[0]
      if (/youtube\.com|youtu\.be/i.test(url)) return { action: "youtube", url }
      if (/github\.com/i.test(url)) {
        const repoMatch = url.match(/github\.com\/([^/]+\/[^/\s?#]+)/)
        return repoMatch ? { action: "github", query: repoMatch[1] } : { action: "web", url }
      }
      if (/bilibili\.com|b23\.tv/i.test(url)) return { action: "bilibili", url }
      return { action: "web", url }
    }

    // 2. 显式搜索前缀
    const searchPrefixes = ["搜索", "搜一下", "查一下", "帮我搜", "帮我查", "帮我找", "search", "look up", "find"]
    for (const prefix of searchPrefixes) {
      if (trimmed.toLowerCase().startsWith(prefix)) {
        const query = trimmed.slice(prefix.length).replace(/^[：:\s]+/, "").trim()
        if (query) return { action: "search", query }
      }
    }

    // 3. 隐式搜索意图检测（含时效性/外部知识关键词）
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
        return { action: "search", query: trimmed }
      }
    }

    return null
  }

  /** 调用 Agent Reach 获取互联网内容 */
  const fetchWebContent = async (
    intent: { action: string; query?: string; url?: string },
    aiMsgId: string
  ): Promise<{ content: string; sources: ChatMessage["webSources"] } | null> => {
    // 更新 AI 消息显示搜索状态
    const statusText = intent.action === "search"
      ? `🔍 正在搜索「${intent.query}」...`
      : intent.action === "web"
      ? `🌐 正在读取网页内容...`
      : intent.action === "youtube"
      ? `▶️ 正在获取视频信息...`
      : intent.action === "github"
      ? `🐙 正在查询 GitHub...`
      : intent.action === "bilibili"
      ? `📺 正在搜索B站...`
      : `🌐 正在获取互联网内容...`

    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId ? { ...m, content: statusText } : m
      )
    )

    try {
      const res = await fetch("/api/agent-reach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.warn("[Agent Reach] 调用失败:", data.error)
        // 降级：不阻断对话，返回错误提示让 AI 基于自身知识回答
        return { content: "", sources: [] }
      }

      const data = await res.json()
      if (!data.success || !data.content) {
        return { content: "", sources: [] }
      }

      // 从搜索结果中提取多条来源
      const sources: ChatMessage["webSources"] = []
      if (intent.action === "search" && data.content) {
        // 尝试从格式化文本提取每条结果的标题和 URL
        const urlMatches = data.content.matchAll(/URL:\s*(https?:\/\/[^\s\n]+)/g)
        const titleMatches = data.content.matchAll(/^\d+\.\s+(.+)$/gm)
        const titles = [...titleMatches].map(m => m[1])
        const urls = [...urlMatches].map(m => m[1])

        for (let i = 0; i < Math.min(urls.length, 5); i++) {
          sources.push({
            action: "search",
            query: intent.query,
            url: urls[i],
            snippet: titles[i] || urls[i],
          })
        }

        // 如果没解析出单独来源，用整体摘要
        if (sources.length === 0) {
          sources.push({
            action: intent.action,
            query: intent.query,
            url: intent.url,
            snippet: data.content.slice(0, 200) + (data.content.length > 200 ? "..." : ""),
          })
        }
      } else {
        sources.push({
          action: intent.action,
          query: intent.query,
          url: intent.url,
          snippet: data.content.slice(0, 200) + (data.content.length > 200 ? "..." : ""),
        })
      }

      return { content: data.content, sources }
    } catch (err) {
      console.warn("[Agent Reach] 网络错误:", err)
      // 网络失败时降级而非完全中断
      return { content: "", sources: [] }
    }
  }

  // ─── Chat ───

  /** 从 content 中解析「## 思考过程」段落，提取为 reasoning（兼容不支持 reasoning_content 的模型） */
  const parseReasoningFromContent = (content: string, existingReasoning: string): { content: string; reasoning: string } => {
    // 如果已有 reasoning_content 流式数据，不需要从 content 中解析
    if (existingReasoning) return { content, reasoning: existingReasoning }

    // 匹配「## 思考过程」标题及其后续内容（直到下一个 ## 标题或末尾）
    const match = content.match(/^##\s*思考过程\s*\n([\s\S]*?)(?=\n##\s|$)/)
    if (match) {
      const reasoning = match[1].trim()
      const cleanedContent = content.replace(/^##\s*思考过程\s*\n[\s\S]*?(?=\n##\s|$)/, '').trim()
      return { content: cleanedContent, reasoning }
    }
    return { content, reasoning: existingReasoning }
  }

  const streamAI = async (userMessages: ChatMessage[], aiMsgId: string, deepThink: boolean = false, selectedText?: string) => {
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

    let ragSources: ChatMessage["ragSources"] | undefined
    let ragContextText = ""
    let webSources: ChatMessage["webSources"] | undefined
    let webContextText = ""
    const lastUserMsg = userMessages[userMessages.length - 1]

    // ── Agent Reach: 互联网内容预取 ──
    let webSearchTriggered = false
    if (lastUserMsg) {
      const webIntent = detectWebIntent(lastUserMsg.content)
      if (webIntent) {
        // 划词搜索：当有划词内容且搜索 query 是指代性描述时，用划词文本替换
        if (webIntent.action === "search" && selectedText) {
          const vague = /^(一下)?(这[段个些]|这[段个些]?(话|内容|文[本字]|句子)|它|this).*/
          if (!webIntent.query || vague.test(webIntent.query)) {
            webIntent.query = selectedText.length > 200 ? selectedText.slice(0, 200) : selectedText
          }
        }
        webSearchTriggered = true
        const webResult = await fetchWebContent(webIntent, aiMsgId)
        if (webResult) {
          webSources = webResult.sources && webResult.sources.length > 0 ? webResult.sources : undefined
          webContextText = webResult.content
        }
      }
    }

    if (ragEnabled && indexStatus?.indexed && lastUserMsg) {
      try {
        const recentUserMsgs = userMessages
          .filter((m) => m.role === "user" && m.id !== "welcome")
          .slice(-3)
          .map((m) => m.content)
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

    const activeFileName = activeFile ? (files.find((f) => f.filename === activeFile)?.title || activeFile) : undefined
    let systemPrompt: string

    // 构建互联网搜索上下文段落
    const webContextBlock = webContextText
      ? `\n\n## 互联网检索结果\n以下是实时从互联网获取的内容（${webSources?.[0]?.query ? `搜索词: 「${webSources[0].query}」` : ""}${webSources?.[0]?.url ? `来源: ${webSources[0].url}` : ""}）：\n\n${webContextText}\n\n## 使用说明\n- 请基于以上互联网内容回答用户问题，优先引用搜索结果中的事实和数据\n- 可以结合自己的知识进行补充和分析，但要区分搜索结果和自身推断\n- 如果搜索结果与问题不完全匹配，提取相关部分并说明\n- 回答中引用具体来源时标注 URL 链接`
      : ""

    if (ragContextText && ragSources && ragSources.length > 0) {
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
${fileContent}` : ""}${webContextBlock}

## 回答规范
1. **优先使用检索到的参考资料**回答问题。引用具体内容时，使用 [来源 N] 标注出处。
2. 如果参考资料中没有足够信息回答问题，你可以基于自己的知识补充，但必须明确说明："以下内容不来自笔记本中的文档，建议独立验证。"
3. 如果问题完全无法从参考资料和你的知识中回答，坦诚说明你不确定，而不是编造答案。
4. 回复使用中文。
5. 如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
    } else if (webContextText) {
      systemPrompt = `你是一个笔记 AI 助手，具备互联网搜索能力。${activeFile ? `用户当前正在查看文档「${activeFileName}」。` : ""}${webContextBlock}\n\n回复请使用中文。如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
    } else if (webSearchTriggered && !webContextText) {
      // 搜索被触发但结果为空（降级情况）
      systemPrompt = `你是一个笔记 AI 助手。${activeFile ? `用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}\n\n` : ""}用户的问题可能涉及实时信息，但互联网搜索未能获取到结果。请基于你自己的知识尽力回答，并在回答末尾说明「注：联网搜索未返回结果，以上内容基于模型知识，可能不是最新信息。」\n\n回复请使用中文。如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
    } else if (activeFile) {
      systemPrompt = `你是一个笔记 AI 助手。用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}\n\n请基于文档内容回答用户的问题，帮助用户理解、总结、润色或扩展文档内容。回复请使用中文。\n\n【重要】如果用户要求你修改、润色、重写、翻译或编辑文档内容，你需要将修改后的完整文档内容放在 <doc-update> 和 </doc-update> 标签之间。这会自动更新中间区域的文档。在标签之外简要说明你做了什么修改即可。例如：\n我已经帮你润色了文档，主要修改了...\n<doc-update>\n修改后的完整文档内容\n</doc-update>`
    } else {
      systemPrompt = "你是一个笔记 AI 助手，具备互联网搜索能力。用户还没有选择文档，请友好地引导用户选择一个文档开始工作。用户也可以发送链接或以「搜索」开头来搜索互联网内容。回复请使用中文。"
    }

    // 划词问答：注入用户选中的文本
    if (selectedText) {
      systemPrompt += `\n\n## 用户选中的文本\n用户在文档中划选了以下内容，请针对这段内容回答用户的问题：\n\n"""\n${selectedText}\n"""\n\n请围绕这段选中文本来回答，如果用户的问题与选中文本无直接关联，也可以结合全文内容回答。`
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...userMessages.filter((m) => m.id !== "welcome").map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ]

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
          deepThink,
        }),
        signal: controller.signal,
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
      let fullReasoning = ""
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
            if (parsed.reasoning) {
              fullReasoning += parsed.reasoning
            }
          } catch {
            // Skip malformed
          }
        }

        if (!rafScheduled) {
          rafScheduled = true
          const snapshot = fullContent
          const reasoningSnapshot = fullReasoning
          const parsed = parseReasoningFromContent(snapshot, reasoningSnapshot)
          requestAnimationFrame(() => {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: parsed.content, reasoning: parsed.reasoning || undefined } : m))
            )
            rafScheduled = false
          })
        }
      }

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
            if (parsed.reasoning) {
              fullReasoning += parsed.reasoning
            }
          } catch {
            // Skip malformed
          }
        }
      }

      if (!fullContent) fullContent = "抱歉，未能获取到回复。"

      // 从 content 中解析「## 思考过程」（兼容不支持 reasoning_content 的模型）
      const parsedFinal = parseReasoningFromContent(fullContent, fullReasoning)
      fullContent = parsedFinal.content
      fullReasoning = parsedFinal.reasoning

      const docUpdateMatch = fullContent.match(/<doc-update>([\s\S]*?)<\/doc-update>/)
      let docUpdate: ChatMessage["docUpdate"] | undefined
      if (docUpdateMatch && activeFile) {
        docUpdate = { content: docUpdateMatch[1].trim(), status: "pending" }
        fullContent = fullContent.replace(/<doc-update>[\s\S]*?<\/doc-update>/, "").trim()
      }

      setChatMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullContent, docUpdate, ragSources, webSources, reasoning: fullReasoning || undefined } : m))
      )
    } catch (err: unknown) {
      // 用户中断（新建对话等）时不显示错误
      if (err instanceof DOMException && err.name === "AbortError") return
      const msg = err instanceof Error ? err.message : "网络错误"
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: `⚠️ 请求异常: ${msg}，请检查网络连接和 API 配置。` }
            : m
        )
      )
    } finally {
      abortControllerRef.current = null
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

    const textSnapshot = selectedText
    setSelectedText("")

    await streamAI(newMessages, aiMsgId, deepThinkMode, textSnapshot || undefined)
    isStreamingRef.current = false
    setChatLoading(false)
  }

  const isStreamingRef = React.useRef(false)
  const abortControllerRef = React.useRef<AbortController | null>(null)

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
    setFileContent(newContent)
    setEditContent(newContent)
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

  // ─── AI Note Generation ───

  const handleGenerate = async (type: string) => {
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 API Key")
      return
    }

    const { GENERATE_TEMPLATES } = await import("./notebook/types")
    const templateLabel = GENERATE_TEMPLATES.find((t) => t.type === type)?.label || "AI 生成"
    const aiMsgId = `gen-${Date.now()}`

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
          deepThink: deepThinkMode,
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
      let fullReasoning = ""
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
            if (parsed.reasoning) {
              fullReasoning += parsed.reasoning
            }
          } catch {
            // skip
          }
        }

        if (!rafScheduled) {
          rafScheduled = true
          const snapshot = fullContent
          const reasoningSnapshot = fullReasoning
          const parsed = parseReasoningFromContent(snapshot, reasoningSnapshot)
          requestAnimationFrame(() => {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: parsed.content, reasoning: parsed.reasoning || undefined } : m))
            )
            rafScheduled = false
          })
        }
      }

      if (!fullContent) fullContent = "未能生成内容，请重试。"

      // 从 content 中解析「## 思考过程」
      const parsedFinal = parseReasoningFromContent(fullContent, fullReasoning)
      fullContent = parsedFinal.content
      fullReasoning = parsedFinal.reasoning

      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: fullContent, reasoning: fullReasoning || undefined, generateMeta: { type, label: templateLabel, done: true } }
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
      const blob = new Blob([msg.content], { type: "text/markdown" })
      const file = new File([blob], filename, { type: "text/markdown" })
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
        method: "POST",
        body: formData,
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
    setChatMessages([...preceding, newAiMsg])
    setChatLoading(true)
    isStreamingRef.current = true

    await streamAI(preceding, newAiMsgId, deepThinkMode)
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

    const aiMsgId = `audio-${Date.now()}`

    const userMsg: ChatMessage = {
      id: `user-audio-${Date.now()}`,
      role: "user",
      content: "生成音频概述",
      timestamp: new Date(),
    }
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      audioMeta: { stage: "script", progress: "正在生成对话脚本..." },
    }
    setChatMessages((prev) => [...prev, userMsg, aiMsg])
    setChatLoading(true)
    setAudioGenerating(true)
    isStreamingRef.current = true

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "script",
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
              ? { ...m, content: `⚠️ ${data.error || "脚本生成失败"}`, audioMeta: { stage: "error" } }
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
              ? { ...m, content: "⚠️ 无法读取响应流", audioMeta: { stage: "error" } }
              : m
          )
        )
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
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, content: `⚠️ ${parsed.error}`, audioMeta: { stage: "error" } }
                    : m
                )
              )
              return
            }
            if (parsed.progress) {
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, audioMeta: { ...m.audioMeta!, progress: parsed.progress } }
                    : m
                )
              )
            }
            if (parsed.step === "script_done" && parsed.script) {
              const scriptContent = parsed.script
                .map((line: { speaker: string; text: string }) =>
                  `**${line.speaker === "host" ? "🎙️ 主持人" : "🎓 专家"}**：${line.text}`
                )
                .join("\n\n")
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        content: `以下是为你生成的对话脚本，请确认内容后点击「生成音频」按钮：\n\n${scriptContent}`,
                        audioMeta: { stage: "confirming", script: parsed.script },
                      }
                    : m
                )
              )
            }
            if (parsed.done) {
              // action=script 完成
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: "⚠️ 网络错误，请重试", audioMeta: { stage: "error" } }
            : m
        )
      )
    } finally {
      setAudioGenerating(false)
      setChatLoading(false)
      isStreamingRef.current = false
    }
  }

  const handleAudioConfirm = async (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.audioMeta?.script) return

    const config = getAIConfig()
    const ttsConfig = getTTSConfig()
    if (!config) {
      showToast("error", "请先配置 API Key")
      return
    }

    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, audioMeta: { ...m.audioMeta!, stage: "synthesizing", progress: "正在合成语音..." } }
          : m
      )
    )
    setChatLoading(true)
    setAudioGenerating(true)

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          apiKey: ttsConfig?.apiKey || config.apiKey,
          apiBase: ttsConfig?.apiBase || config.apiBase,
          model: chatModel,
          ttsModel: ttsConfig?.model || "tts-1",
          voiceHost: ttsConfig?.voiceHost || "alloy",
          voiceExpert: ttsConfig?.voiceExpert || "nova",
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: data.error || "合成失败" } }
              : m
          )
        )
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: "无法读取响应流" } }
              : m
          )
        )
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
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: parsed.error } }
                    : m
                )
              )
              return
            }
            if (parsed.progress) {
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, audioMeta: { ...m.audioMeta!, progress: parsed.progress } }
                    : m
                )
              )
            }
            if (parsed.step === "tts_unavailable") {
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, audioMeta: { ...m.audioMeta!, stage: "done", progress: "TTS 不可用，可使用浏览器朗读" } }
                    : m
                )
              )
            }
            if (parsed.done) {
              if (parsed.hasAudio && parsed.audioUrl) {
                setChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId
                      ? { ...m, audioMeta: { ...m.audioMeta!, stage: "done", audioUrl: parsed.audioUrl, progress: "音频生成完成" } }
                      : m
                  )
                )
              } else {
                setChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId
                      ? { ...m, audioMeta: { ...m.audioMeta!, stage: "done", progress: "脚本已生成，可使用浏览器朗读" } }
                      : m
                  )
                )
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: "网络错误，请重试" } }
            : m
        )
      )
    } finally {
      setAudioGenerating(false)
      setChatLoading(false)
    }
  }

  const handleAudioPlay = (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.audioMeta) return

    if (msg.audioMeta.audioUrl) {
      if (!audioRef.current || audioRef.current.src !== msg.audioMeta.audioUrl) {
        if (audioRef.current) audioRef.current.pause()
        audioRef.current = new Audio(msg.audioMeta.audioUrl)
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
    } else if (msg.audioMeta.script && msg.audioMeta.script.length > 0) {
      const script = msg.audioMeta.script
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
        if (cancelled || index >= script.length) {
          setAudioPlaying(false)
          setAudioCurrentLine(-1)
          return
        }

        setAudioCurrentLine(index)
        const line = script[index]
        const utterance = new SpeechSynthesisUtterance(line.text)
        utterance.lang = "zh-CN"
        utterance.rate = 1.1
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

  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      window.speechSynthesis?.cancel()
    }
  }, [])

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
          <div className="hidden items-center justify-between border-b px-4 py-2 md:flex">
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => {
                          if (editMode) {
                            setEditContent(fileContent)
                            setEditMode(false)
                          } else {
                            setEditMode(true)
                          }
                        }}
                      >
                        {editMode ? <IconEye className="size-3.5" /> : <IconEdit className="size-3.5" />}
                        {editMode ? "预览" : "编辑"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{editMode ? "切换到预览模式" : "切换到编辑模式"}</TooltipContent>
                  </Tooltip>
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
                        onClick={() => { setEditContent(fileContent); setEditMode(false) }}
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
                <div className="flex items-center justify-center py-20">
                  <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : !activeFile ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <IconFile className="mb-2 size-8 opacity-30" />
                  <p className="text-sm">选择一个文件开始阅读</p>
                </div>
              ) : editMode ? (
                <div className="h-full p-4">
                  <RichTextEditor content={editContent} onChange={setEditContent} />
                </div>
              ) : (
                <div className="mx-auto max-w-3xl p-6">
                  <MarkdownRenderer content={fileContent} />
                </div>
              )}
            </div>
            {/* Reading mode panel */}
            {activeFile && !editMode && fileContent && readingMode && (
              <div className="hidden w-80 shrink-0 border-l md:block">
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
          onToggleDeepThink={() => setDeepThinkMode((v) => !v)}
          selectedText={selectedText}
          onClearSelectedText={() => setSelectedText("")}
          onStartNewConversation={startNewConversation}
          onLoadConversation={loadConversation}
          onDeleteConversation={deleteConversation}
          onFetchSourcesData={fetchSourcesData}
          onChatScroll={handleChatScroll}
          onGenerate={handleGenerate}
          onSaveGenerated={handleSaveGenerated}
          onCopyGenerated={handleCopyGenerated}
          onRegenerateGuide={handleRegenerateGuide}
          onRegenerateChat={handleRegenerateChat}
          onApplyDocUpdate={handleApplyDocUpdate}
          onRejectDocUpdate={handleRejectDocUpdate}
          onAudioGenerate={handleAudioGenerate}
          onAudioConfirm={handleAudioConfirm}
          onAudioPlay={handleAudioPlay}
          onAudioStop={handleAudioStop}
        />
      </div>

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

      {/* ─── Toast ─── */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`px-4 py-2 text-sm text-white shadow-lg ${
              toast.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </TooltipProvider>
  )
}