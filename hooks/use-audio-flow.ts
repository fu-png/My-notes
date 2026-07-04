"use client"

import * as React from "react"
import type { ChatMessage } from "@/components/notebook/types"
import { getAIConfig, getTTSConfig } from "@/components/settings-dialog"
import {
  subscribeAudioTask,
  getAudioTask,
  clearAudioTask,
  startAudioScript,
  startAudioSynthesize,
  type AudioTaskState,
} from "@/lib/audio-task-manager"

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

  // ─── 订阅全局音频任务状态，同步到组件 ───
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 组件挂载时恢复正在进行的音频任务
  React.useEffect(() => {
    const existing = getAudioTask(projectId)
    if (!existing) return

    // 恢复状态到 chatMessages
    const isActive = existing.stage === "script" || existing.stage === "synthesizing"
    if (isActive) {
      setAudioGenerating(true)
      setChatLoading(true)
    }

    // 确保消息存在于列表中
    setChatMessages((prev) => {
      const exists = prev.some((m) => m.id === existing.msgId)
      if (exists) {
        return prev.map((m) =>
          m.id === existing.msgId
            ? {
                ...m,
                content: existing.content || m.content,
                audioMeta: {
                  ...m.audioMeta,
                  stage: existing.stage,
                  progress: existing.progress,
                  script: existing.script,
                  manifest: existing.manifest,
                },
              }
            : m
        )
      }
      // 任务消息不在当前列表中，添加进去
      return [
        ...prev,
        {
          id: existing.msgId,
          role: "assistant" as const,
          content: existing.content || "",
          timestamp: new Date(),
          audioMeta: {
            stage: existing.stage,
            progress: existing.progress,
            script: existing.script,
            manifest: existing.manifest,
          },
        },
      ]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 订阅全局任务管理器的状态变化
  React.useEffect(() => {
    const unsub = subscribeAudioTask((state: AudioTaskState) => {
      if (state.projectId !== projectId) return
      if (!mountedRef.current) return

      const isActive = state.stage === "script" || state.stage === "synthesizing"
      setAudioGenerating(isActive)
      setChatLoading(isActive)

      setChatMessages((prev) => {
        const exists = prev.some((m) => m.id === state.msgId)
        if (exists) {
          return prev.map((m) =>
            m.id === state.msgId
              ? {
                  ...m,
                  content: state.content || m.content,
                  audioMeta: {
                    ...m.audioMeta,
                    stage: state.stage,
                    progress: state.progress,
                    script: state.script,
                    manifest: state.manifest,
                  },
                }
              : m
          )
        }
        return prev
      })
    })
    return unsub
  }, [projectId, setChatMessages, setChatLoading])

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

    // 通过全局任务管理器执行，不绑定组件生命周期
    startAudioScript({
      projectId,
      msgId: aiMsgId,
      apiKey: config.apiKey,
      apiBase: config.apiBase,
      model: chatModel,
    })
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

    // 通过全局任务管理器执行
    startAudioSynthesize({
      projectId,
      msgId,
      apiKey: ttsConfig?.apiKey || config.apiKey,
      apiBase: ttsConfig?.apiBase || config.apiBase,
      model: chatModel,
      ttsModel: ttsConfig?.model || "mimo-v2.5-tts",
      voiceHost: ttsConfig?.voiceHost || "冰糖",
      voiceExpert: ttsConfig?.voiceExpert || "苏打",
      script: msg.audioMeta.script,
    })
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

  // Cleanup on unmount — 仅停止音频播放，不中止后台生成任务
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
