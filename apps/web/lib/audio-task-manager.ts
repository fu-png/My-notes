/**
 * 全局音频任务管理器（Module-level 单例）
 *
 * 将音频生成的 HTTP 请求生命周期从 React 组件中解耦，
 * 使得用户在音频生成过程中导航离开页面后，后台请求不会被中断。
 * 用户回到页面时可以恢复查看生成状态。
 */

import { parseSSEStream } from "@/lib/infra/stream-utils"

export type AudioTaskStage = "script" | "confirming" | "synthesizing" | "done" | "error"

export interface AudioTaskState {
  projectId: string
  msgId: string
  stage: AudioTaskStage
  progress: string
  content: string
  script?: { speaker: string; text: string }[]
  manifest?: { chunks: string[]; createdAt: string }
}

type Listener = (state: AudioTaskState) => void

// ─── 全局单例状态 ───

const tasks = new Map<string, AudioTaskState>()
const listeners = new Set<Listener>()
const abortControllers = new Map<string, AbortController>()

function notify(state: AudioTaskState) {
  tasks.set(state.projectId, state)
  listeners.forEach((fn) => fn(state))
}

export function subscribeAudioTask(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAudioTask(projectId: string): AudioTaskState | undefined {
  return tasks.get(projectId)
}

export function clearAudioTask(projectId: string) {
  tasks.delete(projectId)
  const ctrl = abortControllers.get(projectId)
  if (ctrl) {
    ctrl.abort()
    abortControllers.delete(projectId)
  }
}

export async function startAudioScript(options: {
  projectId: string
  msgId: string
  apiKey: string
  apiBase: string
  model: string
}) {
  const { projectId, msgId, apiKey, apiBase, model } = options

  // 中止该项目之前的请求
  const prevCtrl = abortControllers.get(projectId)
  if (prevCtrl) prevCtrl.abort()

  const ctrl = new AbortController()
  abortControllers.set(projectId, ctrl)

  notify({
    projectId,
    msgId,
    stage: "script",
    progress: "正在生成对话脚本...",
    content: "",
  })

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "script", apiKey, apiBase, model }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      notify({ projectId, msgId, stage: "error", progress: data.error || "脚本生成失败", content: `⚠️ ${data.error || "脚本生成失败"}` })
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      notify({ projectId, msgId, stage: "error", progress: "无法读取响应流", content: "⚠️ 无法读取响应流" })
      return
    }

    for await (const parsed of parseSSEStream(reader)) {
      if (ctrl.signal.aborted) return

      if (parsed.error) {
        notify({ projectId, msgId, stage: "error", progress: parsed.error as string, content: `⚠️ ${parsed.error}` })
        return
      }
      if (parsed.progress) {
        const current = tasks.get(projectId)
        notify({ ...current!, progress: parsed.progress as string })
      }
      if (parsed.step === "script_done" && parsed.script) {
        const script = parsed.script as { speaker: string; text: string }[]
        const scriptContent = script
          .map((line) => `**${line.speaker === "host" ? "🎙️ 主持人" : "🎓 专家"}**：${line.text}`)
          .join("\n\n")
        notify({
          projectId,
          msgId,
          stage: "confirming",
          progress: "脚本已生成，请确认",
          content: `以下是为你生成的对话脚本，请确认内容后点击「生成音频」按钮：\n\n${scriptContent}`,
          script,
        })
      }
    }
  } catch (err) {
    if (ctrl.signal.aborted) return
    notify({ projectId, msgId, stage: "error", progress: "网络错误，请重试", content: "⚠️ 网络错误，请重试" })
  } finally {
    abortControllers.delete(projectId)
  }
}

export async function startAudioSynthesize(options: {
  projectId: string
  msgId: string
  apiKey: string
  apiBase: string
  model: string
  ttsModel: string
  voiceHost: string
  voiceExpert: string
  script: { speaker: string; text: string }[]
}) {
  const { projectId, msgId, apiKey, apiBase, model, ttsModel, voiceHost, voiceExpert, script } = options

  const prevCtrl = abortControllers.get(projectId)
  if (prevCtrl) prevCtrl.abort()

  const ctrl = new AbortController()
  abortControllers.set(projectId, ctrl)

  notify({
    projectId,
    msgId,
    stage: "synthesizing",
    progress: "正在合成语音...",
    content: tasks.get(projectId)?.content || "",
    script,
  })

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        apiKey,
        apiBase,
        model,
        ttsModel,
        voiceHost,
        voiceExpert,
        script,
      }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      notify({ projectId, msgId, stage: "error", progress: data.error || "合成失败", content: tasks.get(projectId)?.content || "", script })
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      notify({ projectId, msgId, stage: "error", progress: "无法读取响应流", content: tasks.get(projectId)?.content || "", script })
      return
    }

    for await (const parsed of parseSSEStream(reader)) {
      if (ctrl.signal.aborted) return

      if (parsed.error) {
        notify({ projectId, msgId, stage: "error", progress: parsed.error as string, content: tasks.get(projectId)?.content || "", script })
        return
      }
      if (parsed.progress) {
        const current = tasks.get(projectId)
        notify({ ...current!, progress: parsed.progress as string })
      }
      if (parsed.step === "tts_unavailable") {
        notify({ projectId, msgId, stage: "error", progress: "TTS 服务不可用，请检查 API 配置是否支持语音合成", content: tasks.get(projectId)?.content || "", script })
      }
      if (parsed.done) {
        if (parsed.hasAudio && parsed.manifest) {
          const manifest = parsed.manifest as { chunks: string[]; createdAt: string }
          notify({
            projectId,
            msgId,
            stage: "done",
            progress: "音频生成完成",
            content: tasks.get(projectId)?.content || "",
            script,
            manifest,
          })
        } else {
          notify({
            projectId,
            msgId,
            stage: "error",
            progress: "音频生成失败，请检查 TTS API 配置",
            content: tasks.get(projectId)?.content || "",
            script,
          })
        }
      }
    }
  } catch (err) {
    if (ctrl.signal.aborted) return
    notify({ projectId, msgId, stage: "error", progress: "网络错误，请重试", content: tasks.get(projectId)?.content || "", script })
  } finally {
    abortControllers.delete(projectId)
  }
}
