"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import type { ChatMessage } from "@/components/notebook/types"
import type { SSEEvent, SSEProgressEvent } from "@/lib/deep-research/types"

interface UseDeepResearchOptions {
  projectId: string
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setChatLoading: React.Dispatch<React.SetStateAction<boolean>>
  fetchFiles: () => Promise<void>
  selectFile: (filename: string) => void
}

interface ResearchProgressState {
  phase: string
  step: string
  progress: number
}

/**
 * Deep Research 进度订阅 hook
 *
 * 当 URL 包含 ?research=jobId 时，订阅 SSE 端点，
 * 将研究进度实时展示在 AI 助手面板中（时间线模式）
 */
export function useDeepResearch({
  projectId,
  setChatMessages,
  setChatLoading,
  fetchFiles,
  selectFile,
}: UseDeepResearchOptions) {
  const searchParams = useSearchParams()
  const jobId = searchParams.get("research")
  const queryText = searchParams.get("q") || "深度研究"
  const [researchProgress, setResearchProgress] = React.useState<ResearchProgressState | null>(null)

  React.useEffect(() => {
    if (!jobId) return

    // 标记正在加载
    setChatLoading(true)
    setResearchProgress({ phase: "plan", step: "正在启动深度研究…", progress: 0 })

    // 添加用户消息（研究查询）
    setChatMessages(prev => {
      if (prev.some(m => m.id === "research-user-query")) return prev
      return [...prev, {
        id: "research-user-query",
        role: "user" as const,
        content: `🔍 深度研究：${queryText}`,
        timestamp: new Date(),
      }]
    })

    // 添加初始助手消息（带时间线容器）
    setChatMessages(prev => {
      if (prev.some(m => m.id === "research-timeline")) return prev
      return [...prev, {
        id: "research-timeline",
        role: "assistant" as const,
        content: "",
        timestamp: new Date(),
        loadingStage: "正在启动深度研究…",
        researchSteps: [],
      }]
    })

    let eventSource: EventSource | null = null
    let closed = false

    // 延迟创建 EventSource，避免 React StrictMode 双执行导致连接泄漏
    const timer = setTimeout(() => {
      if (closed) return
      eventSource = new EventSource(`/api/deep-research/subscribe?jobId=${jobId}`)

      eventSource.onmessage = (e) => {
        const data = e.data
        if (data === "[DONE]") {
          eventSource?.close()
          setChatLoading(false)
          return
        }

        try {
          const event = JSON.parse(data) as SSEEvent

          if (event.type === "progress") {
            const progressEvent = event as SSEProgressEvent
            setResearchProgress({ phase: event.phase, step: event.step, progress: event.progress })

            // 累积步骤到时间线消息中
            setChatMessages(prev => {
              return prev.map(m => {
                if (m.id !== "research-timeline") return m
                const newStep = {
                  phase: progressEvent.phase,
                  step: progressEvent.step,
                  progress: progressEvent.progress,
                  detail: progressEvent.detail,
                  timestamp: Date.now(),
                }
                return {
                  ...m,
                  loadingStage: progressEvent.progress < 100 ? progressEvent.step : undefined,
                  researchSteps: [...(m.researchSteps || []), newStep],
                }
              })
            })
          }

          if (event.type === "complete") {
            setResearchProgress(null)
            setChatLoading(false)

            // 更新时间线消息为完成状态，并添加完成消息
            setChatMessages(prev => {
              const updated = prev.map(m => {
                if (m.id !== "research-timeline") return m
                return { ...m, loadingStage: undefined }
              })
              return [...updated, {
                id: `research-complete-${Date.now()}`,
                role: "assistant" as const,
                content: `✅ ${event.message}\n\n深度研究已完成，笔记已保存到项目中。你可以点击左侧文件列表查看生成的内容。`,
                timestamp: new Date(),
              }]
            })

            // 刷新文件列表
            setTimeout(async () => {
              await fetchFiles()
            }, 1500)

            eventSource?.close()

            // 清理 URL 参数
            const url = new URL(window.location.href)
            url.searchParams.delete("research")
            url.searchParams.delete("q")
            window.history.replaceState({}, "", url.toString())
          }

          if (event.type === "error") {
            setResearchProgress(null)
            setChatLoading(false)

            setChatMessages(prev => {
              const updated = prev.map(m => {
                if (m.id !== "research-timeline") return m
                return { ...m, loadingStage: undefined }
              })
              return [...updated, {
                id: `research-error-${Date.now()}`,
                role: "assistant" as const,
                content: `❌ ${event.message}${event.detail ? `\n\n${event.detail}` : ""}`,
                timestamp: new Date(),
              }]
            })

            eventSource?.close()
          }
        } catch {}
      }

      eventSource.onerror = () => {
        eventSource?.close()
        setChatLoading(false)
        setResearchProgress(null)
      }
    }, 100)

    return () => {
      closed = true
      clearTimeout(timer)
      eventSource?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return { researchProgress }
}
