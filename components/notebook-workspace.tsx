"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
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
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const chatEndRef = React.useRef<HTMLDivElement>(null)

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
  const [showAI, setShowAI] = React.useState(true)

  // AI config status
  const [aiConfigured, setAiConfigured] = React.useState(false)

  React.useEffect(() => {
    setAiConfigured(isAIConfigured())
    const handleConfigChange = () => setAiConfigured(isAIConfigured())
    window.addEventListener("ai-config-changed", handleConfigChange)
    return () => window.removeEventListener("ai-config-changed", handleConfigChange)
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
      }
    } catch {
      showToast("error", "创建失败")
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
      }
    } catch {
      showToast("error", "保存失败")
    } finally {
      setSaving(false)
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

    // Build message context
    const systemPrompt = activeFile
      ? `你是一个笔记 AI 助手。用户当前正在查看文档「${files.find((f) => f.filename === activeFile)?.title || activeFile}」。文档内容如下：\n\n${fileContent}\n\n请基于文档内容回答用户的问题，帮助用户理解、总结、润色或扩展文档内容。回复请使用中文。`
      : "你是一个笔记 AI 助手。用户还没有选择文档，请友好地引导用户选择一个文档开始工作。回复请使用中文。"

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

      // Final update
      if (!fullContent) fullContent = "抱歉，未能获取到回复。"
      setChatMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullContent } : m))
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

  const sendQuickMessage = async (text: string) => {
    if (chatLoading) return
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
  const isStreamingRef = React.useRef(false)
  React.useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: isStreamingRef.current ? "instant" : "smooth" })
    }
  }, [chatMessages])

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
          className={`relative flex w-60 shrink-0 flex-col overflow-hidden border-r bg-muted/20 ${isDragging ? "ring-2 ring-inset ring-primary/50" : ""}`}
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
                    <TableOfContents content={fileContent} />
                    <div className="mx-auto max-w-3xl flex-1 px-6 py-8">
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
        <div ref={aiPanelRef} className="relative flex shrink-0 flex-col overflow-hidden border-l bg-background" style={{ width: aiPanelWidth }}>
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

          {/* History view */}
          {showHistory ? (
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
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                    {activeFile && (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        当前文档：{activeTitle}
                      </p>
                    )}
                  </div>

                  {/* Suggested actions pinned to bottom */}
                  <div className="space-y-1.5 pb-2">
                    <p className="px-1 text-[11px] text-muted-foreground/70">试试这些</p>
                    <button
                      className="flex w-full items-center gap-2.5 border border-border px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/50"
                      onClick={() => sendQuickMessage("帮我简要概括下当前文档")}
                    >
                      <IconFile className="size-3.5 shrink-0 text-muted-foreground" />
                      简要概括当前文档
                    </button>
                    <button
                      className="flex w-full items-center gap-2.5 border border-border px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/50"
                      onClick={() => sendQuickMessage("基于当前文档内容，帮我看下是否需要补充")}
                    >
                      <IconEdit className="size-3.5 shrink-0 text-muted-foreground" />
                      检查是否需要补充
                    </button>
                    <button
                      className="flex w-full items-center gap-2.5 border border-border px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/50"
                      onClick={() => sendQuickMessage("帮我润色当前文档的内容")}
                    >
                      <IconLetterCase className="size-3.5 shrink-0 text-muted-foreground" />
                      润色文档内容
                    </button>
                  </div>
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
                        </div>
                      )}
                    </div>
                  ))}

                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>

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
                  {chatModel}
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
          <div className="flex shrink-0 flex-col items-center border-l bg-muted/20 px-1.5 py-3">
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
        <Dialog open={creatingFile} onOpenChange={(open) => { if (!open) { setCreatingFile(false); setNewFileName("") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新建文档</DialogTitle>
            </DialogHeader>
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
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCreatingFile(false); setNewFileName("") }}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleCreateFile}
                disabled={!newFileName.trim()}
              >
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
