"use client"

import * as React from "react"
import type { ChatMessage, PptOutline, SlideImage } from "@/components/notebook/types"
import { PPT_STYLE_PRESETS } from "@/components/notebook/types"
import { getAIConfig, getImageConfig } from "@/components/settings-dialog"
import { parseSSEStream } from "@/lib/infra/stream-utils"

// ─── PPT Session State ──────────────────────────────────────────────────────

export interface PptSession {
  active: boolean
  step: "style-select" | "slide-count" | "custom-prompt" | "generating-outline" | "outline-review" | "generating-images" | "done"
  stylePreset: string
  slideCount: number
  customPrompt: string
  userIntent: string
  outlineMsgId: string | null
  imagesMsgId: string | null
}

// ─── Hook Options & Return Types ────────────────────────────────────────────

interface UsePptFlowOptions {
  projectId: string
  ragEnabled: boolean
  chatMessages: ChatMessage[]
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setChatLoading: (v: boolean) => void
  chatEndRef: React.RefObject<HTMLDivElement | null>
  showToast: (type: "success" | "error", msg: string) => void
}

interface UsePptFlowReturn {
  pptSession: PptSession | null
  setPptSession: React.Dispatch<React.SetStateAction<PptSession | null>>
  startPptFlow: (userText: string) => void
  handlePptCancel: () => void
  handlePptStyleSelect: (styleId: string) => void
  handlePptSlideCountSelect: (count: number) => void
  handlePptStartOutline: (customPrompt: string) => Promise<void>
  handlePptConfirmOutline: (editedOutline: PptOutline) => Promise<void>
  handlePptRetrySlide: (msgId: string, slideIndex: number) => Promise<void>
  handlePptRegenerateOutline: () => void
  pptAbortRef: React.RefObject<AbortController | null>
}

// ─── Hook Implementation ────────────────────────────────────────────────────

export function usePptFlow(options: UsePptFlowOptions): UsePptFlowReturn {
  const {
    projectId,
    ragEnabled,
    chatMessages,
    setChatMessages,
    setChatLoading,
    chatEndRef,
    showToast,
  } = options

  const [pptSession, setPptSession] = React.useState<PptSession | null>(null)
  const pptAbortRef = React.useRef<AbortController | null>(null)
  const scrollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 组件卸载时中止进行中的 PPT 生成请求
  React.useEffect(() => {
    return () => {
      if (pptAbortRef.current) {
        pptAbortRef.current.abort()
        pptAbortRef.current = null
      }
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  // ─── Internal Helpers ───────────────────────────────────────────────────────

  /** Update PPT session with partial state merge */
  const updatePptSession = (updates: Partial<PptSession>) => {
    setPptSession((prev) => (prev ? { ...prev, ...updates } : null))
  }

  /** Update the pptMeta of a specific chat message */
  const updatePptMsg = (msgId: string, metaUpdates: Record<string, unknown>) => {
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pptMeta
          ? { ...m, pptMeta: { ...m.pptMeta, ...metaUpdates } }
          : m
      )
    )
  }

  // ─── Public Handlers ────────────────────────────────────────────────────────

  /** Start PPT flow — called when intent detected or guide button clicked */
  const startPptFlow = (userText: string) => {
    const aiMsgId = `ppt-${Date.now()}`
    const userMsg: ChatMessage = {
      id: `user-ppt-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date(),
    }
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "好的！我将基于整个笔记本的所有文档为你生成 PPT 演示文稿。每页幻灯片将由 AI 生图模型渲染为高清图片。\n\n请先选择一个视觉风格：",
      timestamp: new Date(),
      pptMeta: {
        step: "style-select",
        userIntent: userText,
        stylePreset: "corporate",
      },
    }
    setChatMessages((prev) => [...prev, userMsg, aiMsg])
    setPptSession({
      active: true,
      step: "style-select",
      stylePreset: "corporate",
      slideCount: 8,
      customPrompt: "",
      userIntent: userText,
      outlineMsgId: null,
      imagesMsgId: null,
    })
    scrollTimerRef.current = setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  /** Cancel PPT generation */
  const handlePptCancel = () => {
    if (pptAbortRef.current) {
      pptAbortRef.current.abort()
      pptAbortRef.current = null
    }
    setChatLoading(false)
    setPptSession(null)
    showToast("success", "已取消 PPT 生成")
  }

  /** User selected a style → ask for slide count */
  const handlePptStyleSelect = (styleId: string) => {
    if (!pptSession) return
    const preset = PPT_STYLE_PRESETS.find((p) => p.id === styleId)
    const newMsgId = `ppt-${Date.now()}`
    const aiMsg: ChatMessage = {
      id: newMsgId,
      role: "assistant",
      content: `已选择「${preset?.name}」风格（${preset?.colors}）。\n\n需要生成几页幻灯片？（3-15 页，默认 8 页）`,
      timestamp: new Date(),
      pptMeta: {
        step: "slide-count",
        stylePreset: styleId,
        userIntent: pptSession.userIntent,
      },
    }
    setChatMessages((prev) => [...prev, aiMsg])
    updatePptSession({ step: "slide-count", stylePreset: styleId })
    scrollTimerRef.current = setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  /** User selected slide count → ask for custom prompt (optional) */
  const handlePptSlideCountSelect = (count: number) => {
    if (!pptSession) return
    const newMsgId = `ppt-${Date.now()}`
    const aiMsg: ChatMessage = {
      id: newMsgId,
      role: "assistant",
      content: `好的，${count} 页。\n\n你还有其他风格偏好或内容要求吗？比如「突出技术架构部分」「使用蓝色主题」「加入数据图表」等。如果没有，直接点击「跳过」开始生成。`,
      timestamp: new Date(),
      pptMeta: {
        step: "custom-prompt",
        stylePreset: pptSession.stylePreset,
        slideCount: count,
        userIntent: pptSession.userIntent,
      },
    }
    setChatMessages((prev) => [...prev, aiMsg])
    updatePptSession({ step: "custom-prompt", slideCount: count })
    scrollTimerRef.current = setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  /** User provided custom prompt (or skipped) → start generating outline */
  const handlePptStartOutline = async (customPrompt: string) => {
    if (!pptSession) return
    const config = getAIConfig()
    if (!config) {
      showToast("error", "请先配置 AI API Key")
      return
    }

    const preset = PPT_STYLE_PRESETS.find((p) => p.id === pptSession.stylePreset)
    const outlineMsgId = `ppt-outline-${Date.now()}`

    const aiMsg: ChatMessage = {
      id: outlineMsgId,
      role: "assistant",
      content: customPrompt
        ? `好的，正在根据你的要求生成 PPT 大纲...\n\n> ${customPrompt}`
        : "好的，正在生成 PPT 大纲...",
      timestamp: new Date(),
      pptMeta: {
        step: "generating-outline",
        stylePreset: pptSession.stylePreset,
        slideCount: pptSession.slideCount,
        customPrompt,
        userIntent: pptSession.userIntent,
        streamingText: "",
      },
    }
    setChatMessages((prev) => [...prev, aiMsg])
    updatePptSession({ step: "generating-outline", customPrompt, outlineMsgId })
    setChatLoading(true)

    const abortCtrl = new AbortController()
    pptAbortRef.current = abortCtrl

    const conversationContext = chatMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }))

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/generate-ppt-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: config.apiKey,
          apiBase: config.apiBase,
          model: config.model,
          stylePreset: pptSession.stylePreset,
          styleDescription: preset?.description,
          customPrompt: customPrompt || pptSession.userIntent,
          slideCount: pptSession.slideCount,
          ragEnabled,
          conversationContext,
        }),
        signal: abortCtrl.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        updatePptMsg(outlineMsgId, {
          step: "error",
          streamingText: err?.error || `请求失败 (${response.status})`,
        })
        setChatLoading(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        updatePptMsg(outlineMsgId, { step: "error", streamingText: "无法读取响应流" })
        setChatLoading(false)
        return
      }

      const scrollTimer = setInterval(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "instant" })
      }, 500)

      let rawContent = ""
      let receivedOutline: PptOutline | null = null

      try {
      for await (const parsed of parseSSEStream(reader)) {
        if (abortCtrl.signal.aborted) break

        if (parsed.content) {
          rawContent += parsed.content as string
          updatePptMsg(outlineMsgId, { streamingText: rawContent })
        }
        if (parsed.outline) {
          receivedOutline = parsed.outline as PptOutline
        }
        if (parsed.rawContent && !rawContent) {
          rawContent = parsed.rawContent as string
        }
        if (parsed.error) {
          updatePptMsg(outlineMsgId, { step: "error", streamingText: parsed.error as string })
        }
      }
      } finally {
        clearInterval(scrollTimer)
      }
      pptAbortRef.current = null

      if (abortCtrl.signal.aborted) {
        updatePptMsg(outlineMsgId, { step: "error", streamingText: "已取消" })
        setChatLoading(false)
        return
      }

      if (receivedOutline) {
        // Move to outline review
        updatePptMsg(outlineMsgId, {
          step: "outline-review",
          outline: receivedOutline,
          streamingText: undefined,
        })
        updatePptSession({ step: "outline-review" })
      } else if (rawContent) {
        // Try manual parse
        try {
          let jsonStr = rawContent.trim()
          if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7)
          else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3)
          if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3)
          jsonStr = jsonStr.trim()
          const parsed = JSON.parse(jsonStr) as PptOutline
          updatePptMsg(outlineMsgId, {
            step: "outline-review",
            outline: parsed,
            streamingText: undefined,
          })
          updatePptSession({ step: "outline-review" })
        } catch {
          updatePptMsg(outlineMsgId, { step: "error", streamingText: "大纲解析失败，请重试" })
        }
      } else {
        updatePptMsg(outlineMsgId, { step: "error", streamingText: "未收到大纲内容" })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      const msg = err instanceof Error ? err.message : "未知错误"
      updatePptMsg(outlineMsgId, { step: "error", streamingText: `请求异常: ${msg}` })
    } finally {
      pptAbortRef.current = null
      setChatLoading(false)
    }
  }

  /** Generate a single slide image with auto-retry */
  const generateSingleSlide = async (
    imagesMsgId: string,
    slide: PptOutline["slides"][0],
    index: number,
    total: number,
    preset: { description: string; colors: string } | undefined,
    imageConfig: { apiKey: string; apiBase: string; model: string },
    customPrompt: string,
    abortCtrl: AbortController,
    maxRetries = 3
  ): Promise<void> => {
    setChatMessages((prev) =>
      prev.map((m) => {
        if (m.id !== imagesMsgId || !m.pptMeta?.slideImages) return m
        const imgs = [...m.pptMeta.slideImages]
        imgs[index] = { ...imgs[index], status: "generating" as const }
        return { ...m, pptMeta: { ...m.pptMeta, slideImages: imgs } }
      })
    )

    let lastErr = ""
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (abortCtrl.signal.aborted) return
      try {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/generate-slide-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageApiKey: imageConfig.apiKey,
            imageApiBase: imageConfig.apiBase,
            imageModel: imageConfig.model,
            slide,
            styleDescription: preset?.description,
            styleColors: preset?.colors,
            customPrompt,
            size: "1792x1024",
            slideIndex: index,
            totalSlides: total,
          }),
          signal: abortCtrl.signal,
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err?.error || `生成失败 (${response.status})`)
        }
        const data = await response.json()
        setChatMessages((prev) =>
          prev.map((m) => {
            if (m.id !== imagesMsgId || !m.pptMeta?.slideImages) return m
            const imgs = [...m.pptMeta.slideImages]
            imgs[index] = { ...imgs[index], url: data.url, status: "done" as const }
            return { ...m, pptMeta: { ...m.pptMeta, slideImages: imgs } }
          })
        )
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        lastErr = err instanceof Error ? err.message : "未知错误"
      }
    }
    setChatMessages((prev) =>
      prev.map((m) => {
        if (m.id !== imagesMsgId || !m.pptMeta?.slideImages) return m
        const imgs = [...m.pptMeta.slideImages]
        imgs[index] = { ...imgs[index], status: "error" as const, error: lastErr }
        return { ...m, pptMeta: { ...m.pptMeta, slideImages: imgs } }
      })
    )
  }

  /** User confirmed outline → start generating slide images (concurrent) */
  const handlePptConfirmOutline = async (editedOutline: PptOutline) => {
    if (!pptSession) return
    const imageConfig = getImageConfig()
    if (!imageConfig) {
      showToast("error", "请先在设置中配置生图 API Key")
      return
    }

    const imagesMsgId = `ppt-images-${Date.now()}`
    const slideImages: SlideImage[] = editedOutline.slides.map((_, i) => ({
      index: i,
      url: null,
      status: "pending" as const,
    }))

    const aiMsg: ChatMessage = {
      id: imagesMsgId,
      role: "assistant",
      content: `大纲已确认！正在生成幻灯片图片（共 ${editedOutline.slides.length} 页，全部并发生成中）...`,
      timestamp: new Date(),
      pptMeta: {
        step: "generating-images",
        stylePreset: pptSession.stylePreset,
        outline: editedOutline,
        slideImages,
      },
    }
    setChatMessages((prev) => [...prev, aiMsg])
    updatePptSession({ step: "generating-images", imagesMsgId })
    scrollTimerRef.current = setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)

    const preset = PPT_STYLE_PRESETS.find((p) => p.id === (editedOutline.style || pptSession.stylePreset))
    const total = editedOutline.slides.length

    const abortCtrl = new AbortController()
    pptAbortRef.current = abortCtrl

    await Promise.allSettled(
      editedOutline.slides.map((slide, i) =>
        generateSingleSlide(imagesMsgId, slide, i, total, preset, imageConfig, pptSession.customPrompt, abortCtrl)
      )
    )
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })

    pptAbortRef.current = null

    // Mark as done
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === imagesMsgId && m.pptMeta
          ? { ...m, pptMeta: { ...m.pptMeta, step: "done" as const } }
          : m
      )
    )
    updatePptSession({ step: "done" })
  }

  /** Retry a single failed slide */
  const handlePptRetrySlide = async (msgId: string, slideIndex: number) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.pptMeta?.outline || !msg?.pptMeta?.slideImages) return
    const imageConfig = getImageConfig()
    if (!imageConfig) return

    const pptMeta = msg.pptMeta
    const preset = PPT_STYLE_PRESETS.find((p) => p.id === (pptMeta.outline!.style || pptSession?.stylePreset))
    const outline = msg.pptMeta.outline
    const total = outline.slides.length

    setChatMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.pptMeta?.slideImages) return m
        const imgs = [...m.pptMeta.slideImages]
        imgs[slideIndex] = { ...imgs[slideIndex], status: "generating" as const, error: undefined }
        return { ...m, pptMeta: { ...m.pptMeta, slideImages: imgs } }
      })
    )

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/generate-slide-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: pptAbortRef.current?.signal,
        body: JSON.stringify({
          imageApiKey: imageConfig.apiKey,
          imageApiBase: imageConfig.apiBase,
          imageModel: imageConfig.model,
          slide: outline.slides[slideIndex],
          styleDescription: preset?.description,
          styleColors: preset?.colors,
          customPrompt: pptSession?.customPrompt || "",
          size: "1792x1024",
          slideIndex,
          totalSlides: total,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err?.error || `生成失败 (${response.status})`)
      }

      const data = await response.json()
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.pptMeta?.slideImages) return m
          const imgs = [...m.pptMeta.slideImages]
          imgs[slideIndex] = { ...imgs[slideIndex], url: data.url, status: "done" as const }
          return { ...m, pptMeta: { ...m.pptMeta, slideImages: imgs } }
        })
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "未知错误"
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.pptMeta?.slideImages) return m
          const imgs = [...m.pptMeta.slideImages]
          imgs[slideIndex] = { ...imgs[slideIndex], status: "error" as const, error: errMsg }
          return { ...m, pptMeta: { ...m.pptMeta, slideImages: imgs } }
        })
      )
    }
  }

  /** Regenerate outline from scratch */
  const handlePptRegenerateOutline = () => {
    if (!pptSession) return
    handlePptStartOutline(pptSession.customPrompt)
  }

  // ─── Return ─────────────────────────────────────────────────────────────────

  return {
    pptSession,
    setPptSession,
    startPptFlow,
    handlePptCancel,
    handlePptStyleSelect,
    handlePptSlideCountSelect,
    handlePptStartOutline,
    handlePptConfirmOutline,
    handlePptRetrySlide,
    handlePptRegenerateOutline,
    pptAbortRef,
  }
}
