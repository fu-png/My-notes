"use client"

import * as React from "react"
import type { DocFile, ChatMessage } from "@/components/notebook/types"
import { WELCOME_MESSAGE } from "@/components/notebook/types"
import { getAIConfig, getConfiguredModel, getProviderList, switchActiveProvider, getPersonaPrompt, getUserName } from "@/components/settings-dialog"
import type { ProviderInfo } from "@/components/settings-dialog"
import { detectIntent } from "@/lib/agents/supervisor"
import { buildSystemPrompt, trimConversationHistory } from "@/lib/agents/context-manager"
import { parseSSEStream } from "@/lib/infra/stream-utils"

// ─── Hook Options & Return Types ────────────────────────────────────────────

export interface UseChatFlowParams {
  projectId: string
  // 来自外部的状态
  activeFile: string | null
  files: DocFile[]
  fileContent: string
  ragEnabled: boolean
  indexStatus: { indexed: boolean } | null
  selectedText: string
  setSelectedText: (text: string) => void
  // PPT 相关 — 通过 ref 传入以打破与 usePptFlow 的循环依赖
  // 组件在 usePptFlow 初始化后设置这些 ref 的 .current
  pptSessionRef: React.MutableRefObject<{ active: boolean } | null>
  pptAbortRef: React.MutableRefObject<AbortController | null>
  startPptFlowRef: React.MutableRefObject<((text: string) => void) | null>
  // 回调
  showToast: (type: "success" | "error", msg: string) => void
  fetchFiles: () => Promise<void>
}

export interface UseChatFlowReturn {
  // State
  chatMessages: ChatMessage[]
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  chatInput: string
  setChatInput: (v: string) => void
  chatLoading: boolean
  setChatLoading: React.Dispatch<React.SetStateAction<boolean>>
  chatModel: string
  providerList: ProviderInfo[]
  deepThinkMode: boolean
  generating: boolean
  isStreamingRef: React.MutableRefObject<boolean>

  // Actions
  handleSendMessage: () => Promise<void>
  handleStopGeneration: () => void
  handleSwitchProvider: (providerId: string) => void
  handleToggleDeepThink: () => void
  handleGenerate: (type: string) => Promise<void>
  handleSaveGenerated: (msgId: string) => Promise<void>
  handleCopyGenerated: (msgId: string) => Promise<void>
  handleRegenerateGuide: (type: string) => void
  handleRegenerateChat: (msgId: string) => Promise<void>
}

// ─── Hook Implementation ────────────────────────────────────────────────────

export function useChatFlow(params: UseChatFlowParams): UseChatFlowReturn {
  const {
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
  } = params

  // ─── State ───

  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [chatInput, setChatInput] = React.useState("")
  const [chatLoading, setChatLoading] = React.useState(false)
  const [chatModel, setChatModel] = React.useState(() =>
    typeof window === "undefined" ? "gpt-4o-mini" : getConfiguredModel()
  )
  const [providerList, setProviderList] = React.useState<ProviderInfo[]>(() =>
    typeof window === "undefined" ? [] : getProviderList()
  )
  const [deepThinkMode, setDeepThinkMode] = React.useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("ai-deep-think-mode") === "true"
  })
  const [generating, setGenerating] = React.useState(false)

  const isStreamingRef = React.useRef(false)
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const rafIdsRef = React.useRef<Set<number>>(new Set())

  // ─── DeepThink persistence ───

  React.useEffect(() => {
    localStorage.setItem("ai-deep-think-mode", String(deepThinkMode))
  }, [deepThinkMode])

  // ─── Provider sync ───

  React.useEffect(() => {
    const handler = () => {
      setChatModel(getConfiguredModel())
      setProviderList(getProviderList())
    }
    window.addEventListener("ai-config-changed", handler)
    return () => window.removeEventListener("ai-config-changed", handler)
  }, [])

  // 组件卸载时中止所有进行中的请求和 rAF，防止在已卸载组件上更新状态
  React.useEffect(() => {
    const rafIds = rafIdsRef.current
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      isStreamingRef.current = false
      // 取消所有未完成的 requestAnimationFrame
      rafIds.forEach((id) => cancelAnimationFrame(id))
      rafIds.clear()
    }
  }, [])

  const handleSwitchProvider = React.useCallback((providerId: string) => {
    const newModel = switchActiveProvider(providerId)
    if (newModel) {
      setChatModel(newModel)
      setProviderList(getProviderList())
    }
  }, [])

  const handleToggleDeepThink = React.useCallback(() => {
    setDeepThinkMode((v) => !v)
  }, [])

  // ─── Web Search (Agent Reach) ───

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
        signal: abortControllerRef.current?.signal,
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

  const streamAI = async (userMessages: ChatMessage[], aiMsgId: string, deepThink: boolean = false, selectedTextArg?: string) => {
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

    // ── Agent Reach + RAG: 并行预取（性能优化） ──
    // Web 搜索和 RAG 查询是独立操作，并行执行可减少 40-60% 首 token 延迟
    let webSearchTriggered = false
    let webIntent: { action: string; query?: string; url?: string } | null = null

    if (lastUserMsg) {
      const intent = detectIntent(lastUserMsg.content, { hasPptSession: !!pptSessionRef.current?.active })
      webIntent = intent.type === "web_search" ? { action: intent.action, query: intent.query, url: intent.url } : null
      if (webIntent) {
        // 划词搜索：当有划词内容且搜索 query 是指代性描述时，用划词文本替换
        if (webIntent.action === "search" && selectedTextArg) {
          const vague = /^(一下)?(这[段个些]|这[段个些]?(话|内容|文[本字]|句子)|它|this).*/
          if (!webIntent.query || vague.test(webIntent.query)) {
            webIntent.query = selectedTextArg.length > 200 ? selectedTextArg.slice(0, 200) : selectedTextArg
          }
        }
        webSearchTriggered = true
      }
    }

    // 构造并行任务数组
    const webSearchPromise = webIntent
      ? fetchWebContent(webIntent, aiMsgId)
      : Promise.resolve(null)

    const ragQueryPromise = (ragEnabled && indexStatus?.indexed && lastUserMsg)
      ? (async () => {
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
              signal: abortControllerRef.current?.signal,
              body: JSON.stringify({
                action: "query",
                question: contextQuery,
                apiKey: config.apiKey,
                apiBase: config.apiBase,
                model: chatModel,
                activeFile: activeFile || undefined,
              }),
            })
            const ragData = await ragRes.json()
            if (ragData.context?.sources?.length > 0) {
              return { sources: ragData.context.sources, text: ragData.context.text }
            }
          } catch (err) {
            console.warn("[RAG] Query failed, falling back to plain mode:", err)
          }
          return null
        })()
      : Promise.resolve(null)

    // 并行执行 Web 搜索和 RAG 查询
    const [webResult, ragResult] = await Promise.all([webSearchPromise, ragQueryPromise])

    if (webResult) {
      webSources = webResult.sources && webResult.sources.length > 0 ? webResult.sources : undefined
      webContextText = webResult.content
    }
    if (ragResult) {
      ragSources = ragResult.sources
      ragContextText = ragResult.text
    }

    const activeFileName = activeFile ? (files.find((f) => f.filename === activeFile)?.title || activeFile) : undefined

    // 使用 Context Manager 统一构建 system prompt
    const systemPrompt = buildSystemPrompt({
      ragContextText: ragContextText || undefined,
      ragSources,
      webContextText: webContextText || undefined,
      webSources,
      webSearchTriggered,
      activeFile,
      activeFileName,
      fileContent,
      selectedText: selectedTextArg,
      personaPrompt: getPersonaPrompt(),
      userName: getUserName(),
    })

    const allApiMessages = [
      { role: "system", content: systemPrompt },
      ...userMessages.filter((m) => m.id !== "welcome").map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ]

    // 对话上下文窗口化：裁剪历史消息以控制 token 用量，
    // 避免长对话导致 API 延迟增大或 token 上限截断
    const apiMessages = trimConversationHistory(allApiMessages)

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

      if (!res.body) {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: "⚠️ 无法读取响应流。" } : m))
        )
        return
      }

      // 使用统一的 SSE 流解析工具（静态导入，避免每次调用动态 import 开销）
      const reader = res.body.getReader()
      let fullContent = ""
      let fullReasoning = ""
      let finishReason = ""
      let rafScheduled = false

      for await (const event of parseSSEStream(reader)) {
        // 提取内容增量
        if (typeof event.error === "string") {
          fullContent += `\n⚠️ ${event.error}`
        } else if (typeof event.content === "string") {
          fullContent += event.content
        }
        if (typeof event.reasoning === "string") {
          fullReasoning += event.reasoning
        }
        if (typeof event.finish_reason === "string") {
          finishReason = event.finish_reason
        }

        // rAF 节流：限制 UI 更新频率，避免高频流式输出时过度重渲染
        if (!rafScheduled) {
          rafScheduled = true
          const snapshot = fullContent
          const reasoningSnapshot = fullReasoning
          const parsed = parseReasoningFromContent(snapshot, reasoningSnapshot)
          const rafId = requestAnimationFrame(() => {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: parsed.content, reasoning: parsed.reasoning || undefined } : m))
            )
            rafScheduled = false
            rafIdsRef.current.delete(rafId)
          })
          rafIdsRef.current.add(rafId)
        }
      }

      if (!fullContent) fullContent = "抱歉，未能获取到回复。"

      // 检测是否因 token 上限导致截断
      if (finishReason === "length") {
        fullContent += "\n\n---\n⚠️ **回答被截断**：已达到模型最大输出长度限制。你可以发送「继续」来获取剩余内容。"
      }

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

    // ─── PPT Intent Detection (via Supervisor) ───
    const intent = detectIntent(text, { hasPptSession: !!pptSessionRef.current?.active })
    if (intent.type === "ppt") {
      setChatInput("")
      startPptFlowRef.current?.(text)
      return
    }

    const textSnapshot = selectedText
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
      ...(textSnapshot ? { quotedText: textSnapshot } : {}),
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

    setSelectedText("")

    await streamAI(newMessages, aiMsgId, deepThinkMode, textSnapshot || undefined)
    isStreamingRef.current = false
    setChatLoading(false)
  }

  const handleStopGeneration = React.useCallback(() => {
    // 停止 AI 流式回复
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    // 停止 PPT 生成
    if (pptAbortRef.current) {
      pptAbortRef.current.abort()
      pptAbortRef.current = null
    }
    isStreamingRef.current = false
    setChatLoading(false)
    setGenerating(false)
  }, [pptAbortRef])

  // ─── AI Note Generation ───

  const handleGenerate = async (type: string) => {
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 API Key")
      return
    }

    const { GENERATE_TEMPLATES } = await import("@/components/notebook/types")
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

    // 创建 AbortController 用于取消生成请求
    abortControllerRef.current = new AbortController()

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
        signal: abortControllerRef.current.signal,
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

      // 使用统一的 SSE 流解析工具（与 streamAI 保持一致）
      let fullContent = ""
      let fullReasoning = ""
      let finishReason = ""
      let rafScheduled = false

      for await (const event of parseSSEStream(reader)) {
        if (typeof event.error === "string") {
          fullContent += `\n⚠️ ${event.error}`
        } else if (typeof event.content === "string") {
          fullContent += event.content
        }
        if (typeof event.reasoning === "string") {
          fullReasoning += event.reasoning
        }
        if (typeof event.finish_reason === "string") {
          finishReason = event.finish_reason
        }

        // rAF 节流：限制 UI 更新频率
        if (!rafScheduled) {
          rafScheduled = true
          const snapshot = fullContent
          const reasoningSnapshot = fullReasoning
          const parsed = parseReasoningFromContent(snapshot, reasoningSnapshot)
          const rafId = requestAnimationFrame(() => {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: parsed.content, reasoning: parsed.reasoning || undefined } : m))
            )
            rafScheduled = false
            rafIdsRef.current.delete(rafId)
          })
          rafIdsRef.current.add(rafId)
        }
      }

      if (!fullContent) fullContent = "未能生成内容，请重试。"

      // 检测是否因 token 上限导致截断（与 streamAI 对齐）
      if (finishReason === "length") {
        fullContent += "\n\n---\n⚠️ **内容被截断**：已达到模型最大输出长度限制。"
      }

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

  return {
    // State
    chatMessages,
    setChatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    setChatLoading,
    chatModel,
    providerList,
    deepThinkMode,
    generating,
    isStreamingRef,

    // Actions
    handleSendMessage,
    handleStopGeneration,
    handleSwitchProvider,
    handleToggleDeepThink,
    handleGenerate,
    handleSaveGenerated,
    handleCopyGenerated,
    handleRegenerateGuide,
    handleRegenerateChat,
  }
}
