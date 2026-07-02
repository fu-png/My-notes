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
  const speechRef = React.useRef<{ cancel: () => void } | null>(null)

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
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, audioMeta: { ...m.audioMeta!, progress: parsed.progress as string } }
                : m
            )
          )
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
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, audioMeta: { ...m.audioMeta!, progress: parsed.progress as string } }
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
                  ? { ...m, audioMeta: { ...m.audioMeta!, stage: "done", audioUrl: parsed.audioUrl as string, progress: "音频生成完成" } }
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

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      window.speechSynthesis?.cancel()
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
