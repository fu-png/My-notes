"use client"

import * as React from "react"
import {
  IconSettings,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconVolume,
  IconRobot,
  IconKey,
  IconBuildingBridge,
  IconBrain,
  IconPhoto,
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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

// 生图模型配置
const STORAGE_KEY_IMAGE_API_KEY = "ai-image-api-key"
const STORAGE_KEY_IMAGE_API_BASE = "ai-image-api-base"
const STORAGE_KEY_IMAGE_MODEL = "ai-image-model"

// ─── Defaults ───

const DEFAULT_API_BASE = "https://api.openai.com/v1"
const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_TTS_MODEL = "tts-1"
const DEFAULT_TTS_VOICE_HOST = "alloy"
const DEFAULT_TTS_VOICE_EXPERT = "nova"
const DEFAULT_IMAGE_API_BASE = "https://www.hfsyapi.cn"
const DEFAULT_IMAGE_MODEL = "gpt-image-2"

// ─── Provider Presets ───

const PROVIDER_PRESETS = [
  { name: "OpenAI", apiBase: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"] },
  { name: "DeepSeek", apiBase: "https://api.deepseek.com", models: ["deepseek-chat", "deepseek-reasoner"] },
  { name: "硅基流动", apiBase: "https://api.siliconflow.cn/v1", models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"] },
  { name: "Moonshot", apiBase: "https://api.moonshot.cn/v1", models: ["moonshot-v1-8k", "moonshot-v1-32k"] },
  { name: "通义千问", apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-plus", "qwen-turbo", "qwen-max"] },
  { name: "智谱 GLM", apiBase: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-flash", "glm-4-air", "glm-4"] },
  { name: "自定义", apiBase: "", models: [] },
]

// ─── TTS Voice Options ───

const TTS_VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy（中性）" },
  { value: "echo", label: "Echo（男声）" },
  { value: "fable", label: "Fable（英伦）" },
  { value: "onyx", label: "Onyx（低沉）" },
  { value: "nova", label: "Nova（女声）" },
  { value: "shimmer", label: "Shimmer（温柔）" },
]

// ─── Multi-provider Utility Functions ───

const STORAGE_KEY_PROVIDERS = "ai-assistant-providers"
const STORAGE_KEY_ACTIVE_PROVIDER = "ai-assistant-active-provider"

export interface ProviderInfo {
  id: string
  model: string
  apiBase: string
  isActive: boolean
}

/** Get all configured providers for model switching */
export function getProviderList(): ProviderInfo[] {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS)
  if (!raw) return []
  try {
    const providers = JSON.parse(raw) as { id: string; model: string; apiBase: string; apiKey: string }[]
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROVIDER) || ""
    return providers
      .filter((p) => p.apiKey && p.model)
      .map((p) => ({ id: p.id, model: p.model, apiBase: p.apiBase, isActive: p.id === activeId }))
  } catch {
    return []
  }
}

/** Switch active provider and sync to legacy keys */
export function switchActiveProvider(providerId: string): string | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS)
  if (!raw) return null
  try {
    const providers = JSON.parse(raw) as { id: string; model: string; apiBase: string; apiKey: string }[]
    const target = providers.find((p) => p.id === providerId)
    if (!target) return null
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROVIDER, providerId)
    localStorage.setItem(STORAGE_KEY_API_KEY, target.apiKey)
    localStorage.setItem(STORAGE_KEY_API_BASE, target.apiBase || DEFAULT_API_BASE)
    localStorage.setItem(STORAGE_KEY_MODEL, target.model || DEFAULT_MODEL)
    window.dispatchEvent(new CustomEvent("ai-config-changed"))
    return target.model
  } catch {
    return null
  }
}

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

// ─── Image Generation Config ───

export function getImageConfig() {
  if (typeof window === "undefined") return null
  const aiConfig = getAIConfig()
  const imageApiKey = localStorage.getItem(STORAGE_KEY_IMAGE_API_KEY) || aiConfig?.apiKey || ""
  const imageApiBase = localStorage.getItem(STORAGE_KEY_IMAGE_API_BASE) || aiConfig?.apiBase?.replace(/\/v1$/, "") || DEFAULT_IMAGE_API_BASE
  const imageModel = localStorage.getItem(STORAGE_KEY_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL
  if (!imageApiKey) return null
  return { apiKey: imageApiKey, apiBase: imageApiBase, model: imageModel }
}

export function isImageConfigured(): boolean {
  if (typeof window === "undefined") return false
  const aiConfig = getAIConfig()
  return !!(localStorage.getItem(STORAGE_KEY_IMAGE_API_KEY) || aiConfig?.apiKey)
}

// ─── Component ───

export function SettingsDialog() {
  const [open, setOpen] = React.useState(false)
  const [showKey, setShowKey] = React.useState(false)
  const [showTtsKey, setShowTtsKey] = React.useState(false)
  const [showImageKey, setShowImageKey] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  // AI 对话配置
  const [apiKey, setApiKey] = React.useState("")
  const [apiBase, setApiBase] = React.useState(DEFAULT_API_BASE)
  const [model, setModel] = React.useState(DEFAULT_MODEL)
  const [provider, setProvider] = React.useState("自定义")

  // TTS 配置
  const [ttsApiKey, setTtsApiKey] = React.useState("")
  const [ttsApiBase, setTtsApiBase] = React.useState("")
  const [ttsModel, setTtsModel] = React.useState(DEFAULT_TTS_MODEL)
  const [ttsVoiceHost, setTtsVoiceHost] = React.useState(DEFAULT_TTS_VOICE_HOST)
  const [ttsVoiceExpert, setTtsVoiceExpert] = React.useState(DEFAULT_TTS_VOICE_EXPERT)
  const [useSameKey, setUseSameKey] = React.useState(true)

  // 生图模型配置
  const [imageApiKey, setImageApiKey] = React.useState("")
  const [imageApiBase, setImageApiBase] = React.useState(DEFAULT_IMAGE_API_BASE)
  const [imageModel, setImageModel] = React.useState(DEFAULT_IMAGE_MODEL)
  const [useSameImageKey, setUseSameImageKey] = React.useState(true)

  // 可选模型列表（基于当前 provider）
  const [modelOptions, setModelOptions] = React.useState<string[]>([])

  // 检测当前 provider
  const detectProvider = (base: string) => {
    const found = PROVIDER_PRESETS.find((p) => p.apiBase === base)
    return found ? found.name : "自定义"
  }

  // Load saved config on open
  React.useEffect(() => {
    if (open) {
      const savedKey = localStorage.getItem(STORAGE_KEY_API_KEY) || ""
      const savedBase = localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE
      const savedModel = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
      setApiKey(savedKey)
      setApiBase(savedBase)
      setModel(savedModel)
      const detected = detectProvider(savedBase)
      setProvider(detected)
      const preset = PROVIDER_PRESETS.find((p) => p.name === detected)
      setModelOptions(preset?.models || [])

      const savedTtsKey = localStorage.getItem(STORAGE_KEY_TTS_API_KEY) || ""
      setTtsApiKey(savedTtsKey)
      setTtsApiBase(localStorage.getItem(STORAGE_KEY_TTS_API_BASE) || "")
      setTtsModel(localStorage.getItem(STORAGE_KEY_TTS_MODEL) || DEFAULT_TTS_MODEL)
      setTtsVoiceHost(localStorage.getItem(STORAGE_KEY_TTS_VOICE_HOST) || DEFAULT_TTS_VOICE_HOST)
      setTtsVoiceExpert(localStorage.getItem(STORAGE_KEY_TTS_VOICE_EXPERT) || DEFAULT_TTS_VOICE_EXPERT)
      setUseSameKey(!savedTtsKey)

      const savedImageKey = localStorage.getItem(STORAGE_KEY_IMAGE_API_KEY) || ""
      setImageApiKey(savedImageKey)
      setImageApiBase(localStorage.getItem(STORAGE_KEY_IMAGE_API_BASE) || DEFAULT_IMAGE_API_BASE)
      setImageModel(localStorage.getItem(STORAGE_KEY_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL)
      setUseSameImageKey(!savedImageKey)

      setSaved(false)
    }
  }, [open])

  // 切换服务商时自动填充 API Base 和模型列表
  const handleProviderChange = (name: string) => {
    setProvider(name)
    const preset = PROVIDER_PRESETS.find((p) => p.name === name)
    if (preset) {
      if (preset.apiBase) setApiBase(preset.apiBase)
      setModelOptions(preset.models)
      // 如果当前模型不在预设列表中，且预设列表非空，自动选择第一个
      if (preset.models.length > 0 && !preset.models.includes(model)) {
        setModel(preset.models[0])
      }
    }
  }

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim())
    localStorage.setItem(STORAGE_KEY_API_BASE, apiBase.trim() || DEFAULT_API_BASE)
    localStorage.setItem(STORAGE_KEY_MODEL, model.trim() || DEFAULT_MODEL)

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

    if (useSameImageKey) {
      localStorage.removeItem(STORAGE_KEY_IMAGE_API_KEY)
      localStorage.removeItem(STORAGE_KEY_IMAGE_API_BASE)
    } else {
      localStorage.setItem(STORAGE_KEY_IMAGE_API_KEY, imageApiKey.trim())
      localStorage.setItem(STORAGE_KEY_IMAGE_API_BASE, imageApiBase.trim() || DEFAULT_IMAGE_API_BASE)
    }
    localStorage.setItem(STORAGE_KEY_IMAGE_MODEL, imageModel.trim() || DEFAULT_IMAGE_MODEL)

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

          {/* 服务商快捷选择 */}
          <div className="space-y-2">
            <Label>服务商</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择服务商" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_PRESETS.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              选择服务商可自动填充 API 地址和推荐模型。
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api-key" className="flex items-center gap-1.5">
              <IconKey className="size-3.5 text-muted-foreground" />
              API Key
            </Label>
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
            <Label htmlFor="api-base" className="flex items-center gap-1.5">
              <IconBuildingBridge className="size-3.5 text-muted-foreground" />
              API Base URL
            </Label>
            <Input
              id="api-base"
              type="url"
              placeholder={DEFAULT_API_BASE}
              value={apiBase}
              onChange={(e) => {
                setApiBase(e.target.value)
                setProvider(detectProvider(e.target.value))
                const preset = PROVIDER_PRESETS.find((p) => p.apiBase === e.target.value)
                setModelOptions(preset?.models || [])
              }}
            />
            <p className="text-xs text-muted-foreground">
              默认为 OpenAI 官方地址，也可配置为兼容服务。
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model" className="flex items-center gap-1.5">
              <IconBrain className="size-3.5 text-muted-foreground" />
              对话模型
            </Label>
            <div className="flex gap-2">
              <Input
                id="model"
                placeholder="gpt-4o-mini、deepseek-chat"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex-1"
              />
              {modelOptions.length > 0 && (
                <Select value="" onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue placeholder="推荐" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
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
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Label htmlFor="use-same-key" className="text-sm font-normal cursor-pointer">
              使用与 AI 对话相同的 API Key 和地址
            </Label>
            <Switch
              id="use-same-key"
              checked={useSameKey}
              onCheckedChange={setUseSameKey}
            />
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
              <Select value={ttsVoiceHost} onValueChange={setTtsVoiceHost}>
                <SelectTrigger id="tts-voice-host" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICE_OPTIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tts-voice-expert">专家语音</Label>
              <Select value={ttsVoiceExpert} onValueChange={setTtsVoiceExpert}>
                <SelectTrigger id="tts-voice-expert" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICE_OPTIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* ─── Section 3: 生图模型配置 ─── */}
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconPhoto className="size-4 text-primary" />
            生图模型
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            用于 AI 生成 PPT 幻灯片图片。推荐使用 GPT-Image-2 Pro 等图像生成模型。
          </p>

          {/* 复用 AI Key 开关 */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Label htmlFor="use-same-image-key" className="text-sm font-normal cursor-pointer">
              使用与 AI 对话相同的 API Key
            </Label>
            <Switch
              id="use-same-image-key"
              checked={useSameImageKey}
              onCheckedChange={setUseSameImageKey}
            />
          </div>

          {/* 独立生图 API Key（仅在未勾选时展示） */}
          {!useSameImageKey && (
            <>
              <div className="space-y-2">
                <Label htmlFor="image-api-key">生图 API Key</Label>
                <div className="relative">
                  <Input
                    id="image-api-key"
                    type={showImageKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={imageApiKey}
                    onChange={(e) => setImageApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                    onClick={() => setShowImageKey(!showImageKey)}
                  >
                    {showImageKey ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image-api-base">生图 API Base URL</Label>
                <Input
                  id="image-api-base"
                  type="url"
                  placeholder={DEFAULT_IMAGE_API_BASE}
                  value={imageApiBase}
                  onChange={(e) => setImageApiBase(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Image Model */}
          <div className="space-y-2">
            <Label htmlFor="image-model">生图模型</Label>
            <Input
              id="image-model"
              placeholder="gpt-image-2"
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              支持 gpt-image-2、gpt-image-2pro、dall-e-3 等图像生成模型。
            </p>
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
