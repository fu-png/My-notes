"use client"

import * as React from "react"
import {
  IconSettings,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconVolume,
  IconRobot,
} from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

// ─── Storage Keys ───

const STORAGE_KEY_API_KEY = "ai-assistant-api-key"
const STORAGE_KEY_API_BASE = "ai-assistant-api-base"
const STORAGE_KEY_MODEL = "ai-assistant-model"

// TTS 配置
const STORAGE_KEY_TTS_API_KEY = "ai-tts-api-key"
const STORAGE_KEY_TTS_API_BASE = "ai-tts-api-base"
const STORAGE_KEY_TTS_MODEL = "ai-tts-model"
const STORAGE_KEY_TTS_VOICE_HOST = "ai-tts-voice-host"
const STORAGE_KEY_TTS_VOICE_EXPERT = "ai-tts-voice-expert"

// ─── Defaults ───

const DEFAULT_API_BASE = "https://api.openai.com/v1"
const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_TTS_MODEL = "tts-1"
const DEFAULT_TTS_VOICE_HOST = "alloy"
const DEFAULT_TTS_VOICE_EXPERT = "nova"

// ─── TTS Voice Options ───

const TTS_VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy（中性）" },
  { value: "echo", label: "Echo（男声）" },
  { value: "fable", label: "Fable（英伦）" },
  { value: "onyx", label: "Onyx（低沉）" },
  { value: "nova", label: "Nova（女声）" },
  { value: "shimmer", label: "Shimmer（温柔）" },
]

// ─── Utility Functions ───

export function getAIConfig() {
  if (typeof window === "undefined") return null
  const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY)
  const apiBase = localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE
  const model = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
  if (!apiKey) return null
  return { apiKey, apiBase, model }
}

export function getTTSConfig() {
  if (typeof window === "undefined") return null
  // TTS 可以复用 AI 的 API Key，也可以单独配置
  const aiConfig = getAIConfig()
  const ttsApiKey = localStorage.getItem(STORAGE_KEY_TTS_API_KEY) || aiConfig?.apiKey || ""
  const ttsApiBase = localStorage.getItem(STORAGE_KEY_TTS_API_BASE) || aiConfig?.apiBase || DEFAULT_API_BASE
  const ttsModel = localStorage.getItem(STORAGE_KEY_TTS_MODEL) || DEFAULT_TTS_MODEL
  const voiceHost = localStorage.getItem(STORAGE_KEY_TTS_VOICE_HOST) || DEFAULT_TTS_VOICE_HOST
  const voiceExpert = localStorage.getItem(STORAGE_KEY_TTS_VOICE_EXPERT) || DEFAULT_TTS_VOICE_EXPERT

  if (!ttsApiKey) return null
  return { apiKey: ttsApiKey, apiBase: ttsApiBase, model: ttsModel, voiceHost, voiceExpert }
}

export function isAIConfigured(): boolean {
  if (typeof window === "undefined") return false
  return !!localStorage.getItem(STORAGE_KEY_API_KEY)
}

/** Get the configured model name (from settings) */
export function getConfiguredModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL
  return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
}

// ─── Component ───

export function SettingsDialog() {
  const [open, setOpen] = React.useState(false)
  const [showKey, setShowKey] = React.useState(false)
  const [showTtsKey, setShowTtsKey] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  // AI 对话配置
  const [apiKey, setApiKey] = React.useState("")
  const [apiBase, setApiBase] = React.useState(DEFAULT_API_BASE)
  const [model, setModel] = React.useState(DEFAULT_MODEL)

  // TTS 配置
  const [ttsApiKey, setTtsApiKey] = React.useState("")
  const [ttsApiBase, setTtsApiBase] = React.useState("")
  const [ttsModel, setTtsModel] = React.useState(DEFAULT_TTS_MODEL)
  const [ttsVoiceHost, setTtsVoiceHost] = React.useState(DEFAULT_TTS_VOICE_HOST)
  const [ttsVoiceExpert, setTtsVoiceExpert] = React.useState(DEFAULT_TTS_VOICE_EXPERT)
  const [useSameKey, setUseSameKey] = React.useState(true)

  // Load saved config on open
  React.useEffect(() => {
    if (open) {
      setApiKey(localStorage.getItem(STORAGE_KEY_API_KEY) || "")
      setApiBase(localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE)
      setModel(localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL)

      const savedTtsKey = localStorage.getItem(STORAGE_KEY_TTS_API_KEY) || ""
      setTtsApiKey(savedTtsKey)
      setTtsApiBase(localStorage.getItem(STORAGE_KEY_TTS_API_BASE) || "")
      setTtsModel(localStorage.getItem(STORAGE_KEY_TTS_MODEL) || DEFAULT_TTS_MODEL)
      setTtsVoiceHost(localStorage.getItem(STORAGE_KEY_TTS_VOICE_HOST) || DEFAULT_TTS_VOICE_HOST)
      setTtsVoiceExpert(localStorage.getItem(STORAGE_KEY_TTS_VOICE_EXPERT) || DEFAULT_TTS_VOICE_EXPERT)
      // 如果没有单独配置 TTS Key，说明复用 AI 的 Key
      setUseSameKey(!savedTtsKey)
      setSaved(false)
    }
  }, [open])

  const handleSave = () => {
    // 保存 AI 配置
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim())
    localStorage.setItem(STORAGE_KEY_API_BASE, apiBase.trim() || DEFAULT_API_BASE)
    localStorage.setItem(STORAGE_KEY_MODEL, model.trim() || DEFAULT_MODEL)

    // 保存 TTS 配置
    if (useSameKey) {
      localStorage.removeItem(STORAGE_KEY_TTS_API_KEY)
      localStorage.removeItem(STORAGE_KEY_TTS_API_BASE)
    } else {
      localStorage.setItem(STORAGE_KEY_TTS_API_KEY, ttsApiKey.trim())
      localStorage.setItem(STORAGE_KEY_TTS_API_BASE, ttsApiBase.trim())
    }
    localStorage.setItem(STORAGE_KEY_TTS_MODEL, ttsModel.trim() || DEFAULT_TTS_MODEL)
    localStorage.setItem(STORAGE_KEY_TTS_VOICE_HOST, ttsVoiceHost)
    localStorage.setItem(STORAGE_KEY_TTS_VOICE_EXPERT, ttsVoiceExpert)

    setSaved(true)
    window.dispatchEvent(new CustomEvent("ai-config-changed"))
    setTimeout(() => setOpen(false), 600)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <IconSettings className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>设置</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI 助手设置</DialogTitle>
          <DialogDescription>
            配置 AI 对话和语音合成的参数，所有配置仅保存在本地浏览器中。
          </DialogDescription>
        </DialogHeader>

        {/* ─── Section 1: AI 对话配置 ─── */}
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconRobot className="size-4 text-primary" />
            AI 对话
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              你的 Key 仅保存在本地浏览器中，不会上传到任何服务器。
            </p>
          </div>

          {/* API Base URL */}
          <div className="space-y-2">
            <Label htmlFor="api-base">API Base URL</Label>
            <Input
              id="api-base"
              type="url"
              placeholder={DEFAULT_API_BASE}
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              默认为 OpenAI 官方地址，也可配置为兼容服务（如 DeepSeek、Azure 等）。
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">对话模型</Label>
            <Input
              id="model"
              placeholder="gpt-4o-mini、deepseek-chat"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              用于 AI 对话和笔记本指南生成。
            </p>
          </div>
        </div>

        <Separator />

        {/* ─── Section 2: TTS 语音配置 ─── */}
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconVolume className="size-4 text-primary" />
            语音合成 (TTS)
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            用于音频概述的双人对话语音合成。若不配置，将使用浏览器内置朗读。
          </p>

          {/* 复用 AI Key 开关 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="use-same-key"
              checked={useSameKey}
              onChange={(e) => setUseSameKey(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            <Label htmlFor="use-same-key" className="text-sm font-normal cursor-pointer">
              使用与 AI 对话相同的 API Key 和地址
            </Label>
          </div>

          {/* 独立 TTS API Key（仅在未勾选时展示） */}
          {!useSameKey && (
            <>
              <div className="space-y-2">
                <Label htmlFor="tts-api-key">TTS API Key</Label>
                <div className="relative">
                  <Input
                    id="tts-api-key"
                    type={showTtsKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={ttsApiKey}
                    onChange={(e) => setTtsApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                    onClick={() => setShowTtsKey(!showTtsKey)}
                  >
                    {showTtsKey ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tts-api-base">TTS API Base URL</Label>
                <Input
                  id="tts-api-base"
                  type="url"
                  placeholder={DEFAULT_API_BASE}
                  value={ttsApiBase}
                  onChange={(e) => setTtsApiBase(e.target.value)}
                />
              </div>
            </>
          )}

          {/* TTS Model */}
          <div className="space-y-2">
            <Label htmlFor="tts-model">TTS 模型</Label>
            <Input
              id="tts-model"
              placeholder="tts-1"
              value={ttsModel}
              onChange={(e) => setTtsModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              OpenAI 支持 tts-1（快速）和 tts-1-hd（高清），也可填写兼容服务的模型名。
            </p>
          </div>

          {/* Voice selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tts-voice-host">主持人语音</Label>
              <select
                id="tts-voice-host"
                value={ttsVoiceHost}
                onChange={(e) => setTtsVoiceHost(e.target.value)}
                className="h-9 w-full border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tts-voice-expert">专家语音</Label>
              <select
                id="tts-voice-expert"
                value={ttsVoiceExpert}
                onChange={(e) => setTtsVoiceExpert(e.target.value)}
                className="h-9 w-full border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!apiKey.trim()}>
            {saved ? (
              <>
                <IconCheck className="size-4" data-icon="inline-start" />
                已保存
              </>
            ) : (
              "保存配置"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
