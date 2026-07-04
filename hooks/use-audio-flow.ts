"use client"

import * as React from "react"
import type { ChatMessage } from "@/components/notebook/types"
import { getAIConfig, getTTSConfig } from "@/components/settings-dialog"
import { parseSSEStream } from "@/lib/infra/stream-utils"

interface UseAudioFlowOptions {
  projectId: string
  chatModel: string
  chatMessages: ChatMessage[]
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setChatLoading: (v: boolean) => void
  showToast: (type: "success" | "error", msg: string) => void
}

interface UseAudioFlowReturn {
  audioGenerating: boolean
  audioPlaying: boolean
  audioCurrentLine: number
  handleAudioGenerate: () => Promise<void>
  handleAudioConfirm: (msgId: string) => Promise<void>
  handleAudioPlay: (msgId: string) => void
  handleAudioStop: () => void
}

export function useAudioFlow(options: UseAudioFlowOptions): UseAudioFlowReturn {
  const { projectId, chatModel, chatMessages, setChatMessages, setChatLoading, showToast } = options

  // Audio overview state
  const [audioGenerating, setAudioGenerating] = React.useState(false)
  const [audioPlaying, setAudioPlaying] = React.useState(false)
  const [audioCurrentLine, setAudioCurrentLine] = React.useState(-1)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  // rAF 节流：避免进度更新触发过多重渲染
  const rafScheduledRef = React.useRef(false)
  const pendingAudioUpdateRef = React.useRef<{ msgId: string; progress?: string; stage?: "script" | "confirming" | "synthesizing" | "done" | "error"; content?: string } | null>(null)

  // 批量刷新音频进度更新（使用 requestAnimationFrame 节流）
  const flushAudioUpdate = React.useCallback(() => {
    rafScheduledRef.current = false
    const update = pendingAudioUpdateRef.current
    if (!update) return
    pendingAudioUpdateRef.current = null
    setChatMessages((prev) =>
      prev.map((m) => {
        if (m.id !== update.msgId) return m
        return {
          ...m,
          content: update.content ?? m.content,
          audioMeta: {
            ...m.audioMeta!,
            ...(update.stage ? { stage: update.stage } : {}),
            ...(update.progress ? { progress: update.progress } : {}),
          },
        }
      })
    )
  }, [setChatMessages])

  const scheduleAudioUpdate = React.useCallback((update: { msgId: string; progress?: string; stage?: "script" | "confirming" | "synthesizing" | "done" | "error"; content?: string }) => {
    pendingAudioUpdateRef.current = update
    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true
      requestAnimationFrame(flushAudioUpdate)
    }
  }, [flushAudioUpdate])

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

    // 中止前一个请求
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

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
        signal: ctrl.signal,
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

      for await (const parsed of parseSSEStream(reader)) {
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
          scheduleAudioUpdate({ msgId: aiMsgId, progress: parsed.progress as string })
        }
        if (parsed.step === "script_done" && parsed.script) {
          const scriptContent = (parsed.script as { speaker: string; text: string }[])
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
                    audioMeta: { stage: "confirming", script: parsed.script as { speaker: string; text: string }[] },
                  }
                : m
            )
          )
        }
        if (parsed.done) {
          // action=script 完成
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

    // 中止前一个请求
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          apiKey: ttsConfig?.apiKey || config.apiKey,
          apiBase: ttsConfig?.apiBase || config.apiBase,
          model: chatModel,
          ttsModel: ttsConfig?.model || "mimo-v2.5-tts",
          voiceHost: ttsConfig?.voiceHost || "冰糖",
          voiceExpert: ttsConfig?.voiceExpert || "苏打",
          script: msg.audioMeta.script,
        }),
        signal: ctrl.signal,
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

      for await (const parsed of parseSSEStream(reader)) {
        if (parsed.error) {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: parsed.error as string } }
                : m
            )
          )
          return
        }
        if (parsed.progress) {
          scheduleAudioUpdate({ msgId, progress: parsed.progress as string })
        }
        if (parsed.step === "tts_unavailable") {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: "TTS 服务不可用，请检查 API 配置是否支持语音合成" } }
                : m
            )
          )
        }
        if (parsed.done) {
          if (parsed.hasAudio && parsed.manifest) {
            const manifest = parsed.manifest as { chunks: string[]; createdAt: string }
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, audioMeta: { ...m.audioMeta!, stage: "done", manifest, progress: "音频生成完成" } }
                  : m
              )
            )
          } else {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, audioMeta: { ...m.audioMeta!, stage: "error", progress: "音频生成失败，请检查 TTS API 配置" } }
                  : m
              )
            )
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

  // 用于顺序播放多个 chunk 的索引
  const chunkIndexRef = React.useRef(0)
  const chunkListRef = React.useRef<string[]>([])
  // 使用 ref 避免 useCallback 自引用（lint: cannot-access-variable-before-declared）
  const playNextChunkRef = React.useRef<() => void>(() => {})

  const playNextChunk = React.useCallback(() => {
    const chunks = chunkListRef.current
    const idx = chunkIndexRef.current
    if (idx >= chunks.length) {
      setAudioPlaying(false)
      setAudioCurrentLine(-1)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    audioRef.current = new Audio(chunks[idx])
    setAudioCurrentLine(idx)
    audioRef.current.onended = () => {
      chunkIndexRef.current += 1
      playNextChunkRef.current()
    }
    audioRef.current.onerror = () => {
      // 跳过失败的 chunk
      chunkIndexRef.current += 1
      playNextChunkRef.current()
    }
    audioRef.current.play()
  }, [])

  // 保持 ref 与最新回调同步
  React.useEffect(() => {
    playNextChunkRef.current = playNextChunk
  }, [playNextChunk])

  const handleAudioPlay = (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg?.audioMeta) return

    const rawChunks = msg.audioMeta.manifest?.chunks || (msg.audioMeta.audioUrl ? [msg.audioMeta.audioUrl] : [])
    if (rawChunks.length === 0) return
    // 确保所有 URL 使用 HTTPS，避免 Mixed Content 被浏览器拦截
    const chunks = rawChunks.map(url => url.replace(/^http:\/\//, "https://"))

    if (audioPlaying) {
      if (audioRef.current) audioRef.current.pause()
      setAudioPlaying(false)
    } else {
      chunkListRef.current = chunks
      chunkIndexRef.current = 0
      setAudioPlaying(true)
      playNextChunk()
    }
  }

  const handleAudioStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setAudioPlaying(false)
    setAudioCurrentLine(-1)
  }

  // Cleanup on unmount — 仅停止音频播放，不中止正在进行的生成请求
  // 这样用户在音频生成过程中回退到首页，后台生成不会被中断
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.onended = null
        audioRef.current.onerror = null
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return {
    audioGenerating,
    audioPlaying,
    audioCurrentLine,
    handleAudioGenerate,
    handleAudioConfirm,
    handleAudioPlay,
    handleAudioStop,
  }
}
