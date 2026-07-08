"use client"

import * as React from "react"
import type { DocFile, ChatMessage } from "@/components/notebook/types"
import { WELCOME_MESSAGE } from "@/components/notebook/types"
import { getAIConfig, getConfiguredModel, getConfiguredEmbeddingModel, getEmbeddingConfig, getProviderList, switchActiveProvider, getPersonaPrompt, getUserName } from "@/lib/ai-config"
import type { ProviderInfo } from "@/lib/ai-config"
// Agent 和流处理模块仅在发送消息时才需要，使用懒加载避免首屏打包
// detectIntent / buildSystemPrompt / trimConversationHistory / parseSSEStream / streamIntoMessage
// 在下方实际调用处通过 dynamic import 引入

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
  startPptFlowRef: React.MutableRefObject<((text: string, sourceContent?: string) => void) | null>
  // Deep Research 回调 — 由 notebook-workspace 提供（需要 router）
  onDeepResearch?: (text: string) => void
  // 回调
  showToast: (type: "success" | "error", msg: string) => void
  fetchFiles: () => Promise<void>
  // 当前活跃对话 ID 的 ref（用于后台流判断）
  activeConvIdRef: React.MutableRefObject<string | null>
  // 后台流更新回调（当流在后台运行时，通知外部保存对话内容）
  onBackgroundStreamUpdate?: (convId: string, messages: ChatMessage[]) => void
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
  deepResearchMode: boolean
  generating: boolean
  isStreamingRef: React.MutableRefObject<boolean>
  // 后台流信息（当前有哪些对话在后台流式回复中）
  backgroundStreamsRef: React.MutableRefObject<Map<string, { convId: string; msgId: string; messages: ChatMessage[] }>>

  // Actions
  handleSendMessage: () => Promise<void>
  handleStopGeneration: () => void
  handleSwitchProvider: (providerId: string) => void
  handleToggleDeepThink: () => void
  handleToggleDeepResearch: () => void
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
    onDeepResearch,
    showToast,
    fetchFiles,
    activeConvIdRef,
    onBackgroundStreamUpdate,
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
  const [deepResearchMode, setDeepResearchMode] = React.useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("ai-deep-research-mode") === "true"
  })
  const [generating, setGenerating] = React.useState(false)

  const isStreamingRef = React.useRef(false)
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const rafIdsRef = React.useRef<Set<number>>(new Set())

  // 后台流跟踪：Map<streamKey, { convId, msgId, messages }>
  // 当用户切换对话时，正在进行的流会转为后台模式
  const backgroundStreamsRef = React.useRef<Map<string, { convId: string; msgId: string; messages: ChatMessage[] }>>(new Map())
  // 当前流关联的对话 ID（在 streamAI 开始时设置）
  const streamConvIdRef = React.useRef<string | null>(null)

  /**
   * 包装 setChatMessages：如果当前流在后台运行（对话已切换），
   * 则更新后台流的 messages 副本并通知外部保存，不更新 UI。
   * 如果用户切回来了（对话 ID 重新匹配），同时更新 UI 和后台存储。
   */
  const wrappedSetChatMessages = React.useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const streamConvId = streamConvIdRef.current
      const activeConvId = activeConvIdRef.current

      if (streamConvId && activeConvId && streamConvId !== activeConvId) {
        // 后台模式：流在后台运行，用户在看其他对话
        for (const [, entry] of backgroundStreamsRef.current) {
          if (entry.convId === streamConvId) {
            entry.messages = updater(entry.messages)
            onBackgroundStreamUpdate?.(streamConvId, entry.messages)
            return
          }
        }
      }

      // 前台模式：流在当前对话运行，正常更新 UI
      setChatMessages(updater)

      // 如果有关联的后台流，也同步更新后台存储
      if (streamConvId && streamConvId === activeConvId) {
        for (const [, entry] of backgroundStreamsRef.current) {
          if (entry.convId === streamConvId) {
            // 用最新的 chatMessages 更新后台存储
            // 注意：这里用 updater 计算新值
            break
          }
        }
      }
    },
    [activeConvIdRef, backgroundStreamsRef, onBackgroundStreamUpdate, setChatMessages]
  )

  /** Generate a unique message ID (crypto.randomUUID avoids Date.now() collisions) */
  const genId = (prefix: string) =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `${prefix}-${crypto.randomUUID().slice(0, 8)}`
      : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // ─── DeepThink persistence ───

  React.useEffect(() => {
    localStorage.setItem("ai-deep-think-mode", String(deepThinkMode))
  }, [deepThinkMode])

  React.useEffect(() => {
    localStorage.setItem("ai-deep-research-mode", String(deepResearchMode))
  }, [deepResearchMode])

  // ─── Provider sync ───

  React.useEffect(() => {
    const handler = () => {
      setChatModel(getConfiguredModel())
      setProviderList(getProviderList())
    }
    window.addEventListener("ai-config-changed", handler)
    return () => window.removeEventListener("ai-config-changed", handler)
  }, [])

  // 组件卸载时清理 rAF，但不中止进行中的请求
  // 这样用户在对话/音频生成过程中切换页面，后台请求不会被中断
  React.useEffect(() => {
    const rafIds = rafIdsRef.current
    return () => {
      isStreamingRef.current = false
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

  const handleToggleDeepResearch = React.useCallback(() => {
    setDeepResearchMode((v) => !v)
  }, [])

  // ─── Web Search (Agent Reach) ───

  /** 调用 Agent Reach 获取互联网内容 */
  const fetchWebContent = async (
    intent: { action: string; query?: string; url?: string },
    aiMsgId: string,
    signal?: AbortSignal
  ): Promise<{ content: string; sources: ChatMessage["webSources"]; error?: boolean } | null> => {
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

    wrappedSetChatMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId ? { ...m, content: statusText } : m
      )
    )

    try {
      const res = await fetch("/api/agent-reach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
        signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.warn("[Agent Reach] 调用失败:", data.error)
        // 降级：不阻断对话，标记 error 以便上层展示降级提示
        return { content: "", sources: [], error: true }
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
      if (err instanceof DOMException && err.name === "AbortError") return null
      console.warn("[Agent Reach] 网络错误:", err)
      // 网络失败时降级而非完全中断，标记 error
      return { content: "", sources: [], error: true }
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

  /** 预取结果类型 */
  interface PrefetchResult {
    ragSources?: ChatMessage["ragSources"]
    ragContextText?: string
    ragFetchError?: boolean
    webSources?: ChatMessage["webSources"]
    webContextText?: string
    webSearchTriggered?: boolean
    webFetchError?: boolean
  }

  const streamAI = async ({
    userMessages,
    aiMsgId,
    deepThink = false,
    selectedTextArg,
    intentType,
    prefetch,
  }: {
    userMessages: ChatMessage[]
    aiMsgId: string
    deepThink?: boolean
    selectedTextArg?: string
    intentType?: string
    prefetch?: PrefetchResult
  }) => {
    const config = getAIConfig()
    if (!config) {
      wrappedSetChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: "请先点击右上角的设置按钮（⚙️），配置 AI 助手的 API Key 后即可开始对话。" }
            : m
        )
      )
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    // 设置当前流关联的对话 ID
    streamConvIdRef.current = activeConvIdRef.current

    // 在后台流跟踪中注册
    if (streamConvIdRef.current) {
      backgroundStreamsRef.current.set(aiMsgId, {
        convId: streamConvIdRef.current,
        msgId: aiMsgId,
        messages: [...userMessages, { id: aiMsgId, role: "assistant" as const, content: "", timestamp: new Date() }],
      })
    }

    const {
      ragSources, ragContextText, ragFetchError,
      webSources, webContextText, webSearchTriggered, webFetchError,
    } = prefetch || {}

    const activeFileName = activeFile ? (files.find((f) => f.filename === activeFile)?.title || activeFile) : undefined

    // 切换到"组织回答"阶段
    if (ragSources || webSearchTriggered) {
      wrappedSetChatMessages((prev) =>
        prev.map((m) => m.id === aiMsgId ? { ...m, content: "", loadingStage: "正在组织回答..." } : m)
      )
    }

    // 使用 Context Manager 统一构建 system prompt
    const { buildSystemPrompt } = await import("@/lib/agents/context-manager")
    // 所有意图都尝试加载对应智能体的 system prompt
    // 优先级：意图映射智能体 > 用户激活智能体 > 用户自定义 persona
    let agentSystemPrompt: string | undefined
    if (intentType) {
      const { getAgentSystemPrompt } = await import("@/lib/ai-config")
      agentSystemPrompt = getAgentSystemPrompt(intentType) || undefined
    }
    const systemPrompt = buildSystemPrompt({
      ragContextText: ragContextText || undefined,
      ragSources,
      webContextText: webContextText || undefined,
      webSources,
      webSearchTriggered,
      webFetchError,
      ragFetchError,
      activeFile,
      activeFileName,
      fileContent,
      selectedText: selectedTextArg,
      agentRole: agentSystemPrompt,
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

    const { trimConversationHistory } = await import("@/lib/agents/context-manager")
    const apiMessages = trimConversationHistory(allApiMessages)

    try {
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
        wrappedSetChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: `⚠️ ${data.error || "请求失败，请检查 API 配置。"}` }
              : m
          )
        )
        return
      }

      if (!res.body) {
        wrappedSetChatMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: "⚠️ 无法读取响应流。" } : m))
        )
        return
      }

      // 使用统一的流式消费 helper（消除与 handleGenerate 的重复代码）
      const reader = res.body.getReader()
      const { streamIntoMessage } = await import("@/lib/infra/stream-utils")
      const result = await streamIntoMessage({
        reader,
        msgId: aiMsgId,
        setChatMessages: wrappedSetChatMessages,
        parseReasoningFromContent,
        rafIdsRef,
      })

      let fullContent = result.content
      let fullReasoning = result.reasoning

      if (!fullContent) fullContent = "抱歉，未能获取到回复。"

      // 检测是否因 token 上限导致截断
      if (result.finishReason === "length") {
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

      wrappedSetChatMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, content: fullContent, docUpdate, ragSources, webSources, reasoning: fullReasoning || undefined } : m))
      )
    } catch (err: unknown) {
      // 用户中断（新建对话等）时不显示错误
      if (err instanceof DOMException && err.name === "AbortError") {
        // 即使中断也保存已生成的内容到后台对话
        return
      }
      // [P1 FIX] 流中断时保留已生成的内容，而非整体替换为错误消息
      const msg = err instanceof Error ? err.message : "网络错误"
      wrappedSetChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== aiMsgId) return m
          const existing = m.content || ""
          const errorSuffix = `\n\n⚠️ 连接中断: ${msg}，请检查网络连接和 API 配置。`
          return { ...m, content: existing ? existing + errorSuffix : `⚠️ 请求异常: ${msg}，请检查网络连接和 API 配置。` }
        })
      )
    } finally {
      // [P0 FIX] 只清空自己创建的 controller，防止并发请求互相覆盖
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      // 清理后台流跟踪
      backgroundStreamsRef.current.delete(aiMsgId)
      streamConvIdRef.current = null
    }
  }

  const handleSendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    // ─── Deep Research 开关：强制走研究流程 ───
    if (deepResearchMode) {
      setChatInput("")
      onDeepResearch?.(text)
      return
    }

    // ─── 智能意图识别（规则快筛 + LLM 兜底）───
    const config = getAIConfig()
    const { detectIntentSmart, GENERATE_INTENT_TYPES } = await import("@/lib/agents/supervisor")
    const { getAgentSystemPrompt } = await import("@/lib/ai-config")
    // 加载用户自定义的 supervisor 提示词（单一来源，与设置页同步）
    const supervisorPrompt = getAgentSystemPrompt("supervisor") || undefined
    const intent = await detectIntentSmart(text, {
      hasPptSession: !!pptSessionRef.current?.active,
      apiKey: config?.apiKey,
      apiBase: config?.apiBase,
      model: config?.model,
      supervisorPrompt,
    })

    // 根据意图路由
    if (intent.type === "deep_research") {
      setChatInput("")
      onDeepResearch?.(intent.query || text)
      return
    }

    if (intent.type === "ppt") {
      setChatInput("")
      // 提取最近一条 AI 回答作为 PPT 素材内容
      // 当用户在 AI 回答后说"做成PPT"时，自动将上轮回答传入
      const lastAssistantMsg = chatMessages
        .filter((m) => m.role === "assistant" && m.content && !m.pptMeta)
        .pop()
      const sourceContent = lastAssistantMsg?.content || undefined
      startPptFlowRef.current?.(intent.userText || text, sourceContent)
      return
    }

    // 内容生成类意图 → 走 handleGenerate
    if (GENERATE_INTENT_TYPES.has(intent.type)) {
      setChatInput("")
      handleGenerate(intent.type)
      return
    }

    const textSnapshot = selectedText
    const userMsg: ChatMessage = {
      id: genId("user"),
      role: "user",
      content: text,
      timestamp: new Date(),
      ...(textSnapshot ? { quotedText: textSnapshot } : {}),
    }
    const aiMsgId = genId("ai")
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

    // 提前设置流关联的对话 ID，以便 RAG/web 搜索阶段也能感知后台模式
    streamConvIdRef.current = activeConvIdRef.current
    if (streamConvIdRef.current) {
      backgroundStreamsRef.current.set(aiMsgId, {
        convId: streamConvIdRef.current,
        msgId: aiMsgId,
        messages: [...newMessages, aiMsg],
      })
    }

    setSelectedText("")

    // ─── 意图路由统一管控：网络搜索 & RAG 检索 ───
    const configForFetch = getAIConfig()
    const controller = new AbortController()
    abortControllerRef.current = controller

    // 判断是否需要网络搜索
    let webSearchInfo: { action: string; query?: string; url?: string } | null = null
    if (intent.type === "web_search") {
      webSearchInfo = { action: intent.action, query: intent.query, url: intent.url }
      // 划词搜索：当有划词内容且搜索 query 是指代性描述时，用划词文本替换
      if (webSearchInfo.action === "search" && textSnapshot) {
        const vague = /^(一下)?(这[段个些]|这[段个些]?(话|内容|文[本字]|句子)|它|this).*/
        if (!webSearchInfo.query || vague.test(webSearchInfo.query)) {
          webSearchInfo.query = textSnapshot.length > 200 ? textSnapshot.slice(0, 200) : textSnapshot
        }
      }
    }

    // 判断是否需要 RAG 检索
    // - 闲聊（needsRAG=false 且无划词）→ 跳过
    // - 知识问答 / 划词提问 / 其他意图 → 走 RAG
    const skipRAG = intent.type === "chat" && !textSnapshot && intent.needsRAG === false
    const willDoRag = !skipRAG && ragEnabled && !!text
    const willDoWeb = !!webSearchInfo

    // 阶段性 loading 文案
    if (willDoRag) {
      wrappedSetChatMessages((prev) =>
        prev.map((m) => m.id === aiMsgId ? { ...m, content: "", loadingStage: "正在检索知识库..." } : m)
      )
    } else if (willDoWeb) {
      wrappedSetChatMessages((prev) =>
        prev.map((m) => m.id === aiMsgId ? { ...m, content: "", loadingStage: "正在搜索互联网..." } : m)
      )
    }

    // 并行执行网络搜索和 RAG 检索
    const webSearchPromise = webSearchInfo
      ? fetchWebContent(webSearchInfo, aiMsgId, controller.signal)
      : Promise.resolve(null)

    const ragQueryPromise = willDoRag && configForFetch
      ? (async () => {
          try {
            const contextQuery = text
            const ragRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rag`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                action: "query",
                question: contextQuery,
                apiKey: configForFetch.apiKey,
                apiBase: configForFetch.apiBase,
                model: chatModel,
                embeddingModel: getEmbeddingConfig()?.embeddingModel || getConfiguredEmbeddingModel(),
                embeddingApiKey: getEmbeddingConfig()?.apiKey,
                embeddingApiBase: getEmbeddingConfig()?.apiBase,
                rerankModel: getEmbeddingConfig()?.rerankModel,
                activeFile: activeFile || undefined,
              }),
            })
            if (!ragRes.ok) {
              const errBody = await ragRes.json().catch(() => ({}))
              const errMsg = errBody.error || `HTTP ${ragRes.status}`
              console.warn("[RAG] Query HTTP error:", errMsg)
              showToast("error", `知识库检索失败: ${errMsg}`)
              return { sources: undefined, text: "", error: true }
            }
            const ragData = await ragRes.json()
            if (ragData.context?.warnings?.length > 0) {
              for (const w of ragData.context.warnings) {
                showToast("error", w)
              }
            }
            if (ragData.context?.sources?.length > 0) {
              return { sources: ragData.context.sources, text: ragData.context.text }
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return null
            const errMsg = err instanceof Error ? err.message : "未知错误"
            console.warn("[RAG] Query failed, falling back to plain mode:", err)
            showToast("error", `知识库检索异常: ${errMsg}`)
            return { sources: undefined, text: "", error: true }
          }
          return null
        })()
      : Promise.resolve(null)

    const [webResult, ragResult] = await Promise.all([webSearchPromise, ragQueryPromise])

    if (controller.signal.aborted) return

    // 组装预取结果
    const prefetch: PrefetchResult = {}
    if (webResult) {
      prefetch.webSources = webResult.sources && webResult.sources.length > 0 ? webResult.sources : undefined
      prefetch.webContextText = webResult.content
      prefetch.webSearchTriggered = true
      if (webResult.error) prefetch.webFetchError = true
    } else if (willDoWeb) {
      prefetch.webSearchTriggered = true
    }
    if (ragResult) {
      const r = ragResult as { sources?: ChatMessage["ragSources"]; text: string; error?: boolean }
      prefetch.ragSources = r.sources
      prefetch.ragContextText = r.text
      if (r.error) prefetch.ragFetchError = true
    }

    // 保存当前对话 ID，用于流完成后判断是否在后台
    const streamConvId = activeConvIdRef.current

    await streamAI({
      userMessages: newMessages,
      aiMsgId,
      deepThink: deepThinkMode,
      selectedTextArg: textSnapshot || undefined,
      intentType: intent.type,
      prefetch,
    })
    // 只有当前对话仍然是流关联的对话时，才清理 UI 状态
    // 如果流在后台完成（用户已切换对话），不影响新对话的 UI 状态
    if (streamConvId === activeConvIdRef.current) {
      isStreamingRef.current = false
      setChatLoading(false)
    }
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
    const aiMsgId = genId("gen")

    const userMsg: ChatMessage = {
      id: genId("user-gen"),
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

    // 设置当前流关联的对话 ID（与 streamAI 一致）
    streamConvIdRef.current = activeConvIdRef.current
    const genStreamConvId = activeConvIdRef.current
    if (streamConvIdRef.current) {
      backgroundStreamsRef.current.set(aiMsgId, {
        convId: streamConvIdRef.current,
        msgId: aiMsgId,
        messages: [...chatMessages, userMsg, aiMsg],
      })
    }

    try {
      // 从智能体库加载对应类型的 system prompt，与设置中配置保持同步
      const { getAgentSystemPrompt } = await import("@/lib/ai-config")
      const agentPrompt = getAgentSystemPrompt(type) || undefined

      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: chatModel,
          deepThink: deepThinkMode,
          customPrompt: agentPrompt,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        wrappedSetChatMessages((prev) =>
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
        wrappedSetChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: "⚠️ 无法读取响应流", generateMeta: { type, label: templateLabel, done: true } }
              : m
          )
        )
        return
      }

      // 使用统一的流式消费 helper（与 streamAI 保持一致，消除重复代码）
      const { streamIntoMessage } = await import("@/lib/infra/stream-utils")
      const result = await streamIntoMessage({
        reader,
        msgId: aiMsgId,
        setChatMessages: wrappedSetChatMessages,
        parseReasoningFromContent,
        rafIdsRef,
      })

      let fullContent = result.content
      let fullReasoning = result.reasoning

      if (!fullContent) fullContent = "未能生成内容，请重试。"

      // 检测是否因 token 上限导致截断（与 streamAI 对齐）
      if (result.finishReason === "length") {
        fullContent += "\n\n---\n⚠️ **内容被截断**：已达到模型最大输出长度限制。"
      }

      // 从 content 中解析「## 思考过程」
      const parsedFinal = parseReasoningFromContent(fullContent, fullReasoning)
      fullContent = parsedFinal.content
      fullReasoning = parsedFinal.reasoning

      wrappedSetChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: fullContent, reasoning: fullReasoning || undefined, generateMeta: { type, label: templateLabel, done: true } }
            : m
        )
      )
    } catch {
      wrappedSetChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: "⚠️ 网络错误，请重试", generateMeta: { type, label: templateLabel, done: true } }
            : m
        )
      )
    } finally {
      // 只有当前对话仍然是流关联的对话时，才清理 UI 状态
      if (genStreamConvId === activeConvIdRef.current) {
        setGenerating(false)
        setChatLoading(false)
        isStreamingRef.current = false
      }
      // 清理后台流跟踪
      backgroundStreamsRef.current.delete(aiMsgId)
      streamConvIdRef.current = null
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
    const newAiMsgId = genId("ai")
    const newAiMsg: ChatMessage = {
      id: newAiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    }
    setChatMessages([...preceding, newAiMsg])
    setChatLoading(true)
    isStreamingRef.current = true

    const streamConvId = activeConvIdRef.current
    await streamAI({ userMessages: preceding, aiMsgId: newAiMsgId, deepThink: deepThinkMode })
    if (streamConvId === activeConvIdRef.current) {
      isStreamingRef.current = false
      setChatLoading(false)
    }
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
    deepResearchMode,
    generating,
    isStreamingRef,
    backgroundStreamsRef,

    // Actions
    handleSendMessage,
    handleStopGeneration,
    handleSwitchProvider,
    handleToggleDeepThink,
    handleToggleDeepResearch,
    handleGenerate,
    handleSaveGenerated,
    handleCopyGenerated,
    handleRegenerateGuide,
    handleRegenerateChat,
  }
}
