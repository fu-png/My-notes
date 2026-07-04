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
import { Textarea } from "@/components/ui/textarea"
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

// 从 ai-config 导入所有配置常量和工具函数（同时供本组件使用和向后兼容再导出）
import {
  getAIConfig,
  getTTSConfig,
  isAIConfigured,
  getConfiguredModel,
  getConfiguredEmbeddingModel,
  getImageConfig,
  isImageConfigured,
  getPersonaPrompt,
  getUserName,
  getProviderList,
  switchActiveProvider,
  PROVIDER_PRESETS,
  TTS_VOICE_OPTIONS,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE_HOST,
  DEFAULT_TTS_VOICE_EXPERT,
  DEFAULT_IMAGE_API_BASE,
  DEFAULT_IMAGE_MODEL,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_API_BASE,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_EMBEDDING_MODEL,
  STORAGE_KEY_TTS_API_KEY,
  STORAGE_KEY_TTS_API_BASE,
  STORAGE_KEY_TTS_MODEL,
  STORAGE_KEY_TTS_VOICE_HOST,
  STORAGE_KEY_TTS_VOICE_EXPERT,
  STORAGE_KEY_IMAGE_API_KEY,
  STORAGE_KEY_IMAGE_API_BASE,
  STORAGE_KEY_IMAGE_MODEL,
  STORAGE_KEY_PERSONA,
  STORAGE_KEY_USER_NAME,
} from "@/lib/ai-config"

// 向后兼容再导出，新消费者应直接从 "@/lib/ai-config" 导入
export {
  getAIConfig,
  getTTSConfig,
  isAIConfigured,
  getConfiguredModel,
  getConfiguredEmbeddingModel,
  getImageConfig,
  isImageConfigured,
  getPersonaPrompt,
  getUserName,
  getProviderList,
  switchActiveProvider,
  PROVIDER_PRESETS,
  TTS_VOICE_OPTIONS,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE_HOST,
  DEFAULT_TTS_VOICE_EXPERT,
  DEFAULT_IMAGE_API_BASE,
  DEFAULT_IMAGE_MODEL,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_API_BASE,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_EMBEDDING_MODEL,
  STORAGE_KEY_TTS_API_KEY,
  STORAGE_KEY_TTS_API_BASE,
  STORAGE_KEY_TTS_MODEL,
  STORAGE_KEY_TTS_VOICE_HOST,
  STORAGE_KEY_TTS_VOICE_EXPERT,
  STORAGE_KEY_IMAGE_API_KEY,
  STORAGE_KEY_IMAGE_API_BASE,
  STORAGE_KEY_IMAGE_MODEL,
  STORAGE_KEY_PERSONA,
  STORAGE_KEY_USER_NAME,
}

import type { ProviderInfo } from "@/lib/ai-config"
export type { ProviderInfo }

// ─── Component ───

export function SettingsDialog() {
  const [open, setOpen] = React.useState(false)

  // 键盘快捷键：Cmd+, (macOS) / Ctrl+, (其他平台) 打开设置
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
  const [showKey, setShowKey] = React.useState(false)
  const [showTtsKey, setShowTtsKey] = React.useState(false)
  const [showImageKey, setShowImageKey] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [apiBaseError, setApiBaseError] = React.useState("")
  const [ttsApiBaseError, setTtsApiBaseError] = React.useState("")
  const [imageApiBaseError, setImageApiBaseError] = React.useState("")

  // AI 对话配置
  const [apiKey, setApiKey] = React.useState("")
  const [apiBase, setApiBase] = React.useState(DEFAULT_API_BASE)
  const [model, setModel] = React.useState(DEFAULT_MODEL)
  const [embeddingModel, setEmbeddingModel] = React.useState(DEFAULT_EMBEDDING_MODEL)
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

  // AI 个性 / Persona
  const [personaPrompt, setPersonaPrompt] = React.useState("")
  const [userName, setUserName] = React.useState("")

  // 可选模型列表（基于当前 provider）
  const [modelOptions, setModelOptions] = React.useState<string[]>([])

  // 检测当前 provider
  const detectProvider = (base: string) => {
    const found = PROVIDER_PRESETS.find((p) => p.apiBase === base)
    return found ? found.name : "自定义"
  }

  // 打开对话框时加载已保存的配置（从 effect 移至事件处理以避免 set-state-in-effect）
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      const savedKey = localStorage.getItem(STORAGE_KEY_API_KEY) || ""
      const savedBase = localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE
      const savedModel = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
      setApiKey(savedKey)
      setApiBase(savedBase)
      setModel(savedModel)
      setEmbeddingModel(localStorage.getItem(STORAGE_KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL)
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

      setPersonaPrompt(localStorage.getItem(STORAGE_KEY_PERSONA) || "")
      setUserName(localStorage.getItem(STORAGE_KEY_USER_NAME) || "")

      setSaved(false)
    }
    setOpen(newOpen)
  }

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
    // Validate API Base URLs before saving
    const trimmedApiBase = apiBase.trim()
    if (trimmedApiBase) {
      try {
        const parsed = new URL(trimmedApiBase)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol")
      } catch {
        setApiBaseError("请输入合法的 http:// 或 https:// URL")
        return
      }
    }
    const trimmedTtsApiBase = !useSameKey ? ttsApiBase.trim() : ""
    if (trimmedTtsApiBase) {
      try {
        const parsed = new URL(trimmedTtsApiBase)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol")
      } catch {
        setTtsApiBaseError("请输入合法的 http:// 或 https:// URL")
        return
      }
    }
    const trimmedImageApiBase = !useSameImageKey ? imageApiBase.trim() : ""
    if (trimmedImageApiBase) {
      try {
        const parsed = new URL(trimmedImageApiBase)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol")
      } catch {
        setImageApiBaseError("请输入合法的 http:// 或 https:// URL")
        return
      }
    }

    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim())
    localStorage.setItem(STORAGE_KEY_API_BASE, apiBase.trim() || DEFAULT_API_BASE)
    localStorage.setItem(STORAGE_KEY_MODEL, model.trim() || DEFAULT_MODEL)
    localStorage.setItem(STORAGE_KEY_EMBEDDING_MODEL, embeddingModel.trim() || DEFAULT_EMBEDDING_MODEL)

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

    // Persona
    if (userName.trim()) {
      localStorage.setItem(STORAGE_KEY_USER_NAME, userName.trim())
    } else {
      localStorage.removeItem(STORAGE_KEY_USER_NAME)
    }
    if (personaPrompt.trim()) {
      localStorage.setItem(STORAGE_KEY_PERSONA, personaPrompt.trim())
    } else {
      localStorage.removeItem(STORAGE_KEY_PERSONA)
    }

    setSaved(true)
    window.dispatchEvent(new CustomEvent("ai-config-changed"))
    setTimeout(() => setSaved(false), 1500) // 显示保存成功状态 1.5 秒，不自动关闭
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="设置">
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
                aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
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
                setApiBaseError("")
                setProvider(detectProvider(e.target.value))
                const preset = PROVIDER_PRESETS.find((p) => p.apiBase === e.target.value)
                setModelOptions(preset?.models || [])
              }}
            />
            {apiBaseError && <p className="text-xs text-destructive">{apiBaseError}</p>}
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

          {/* Embedding Model */}
          <div className="space-y-2">
            <Label htmlFor="embedding-model" className="flex items-center gap-1.5">
              <IconBrain className="size-3.5 text-muted-foreground" />
              Embedding 模型
            </Label>
            <Input
              id="embedding-model"
              placeholder={DEFAULT_EMBEDDING_MODEL}
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              用于知识库索引（RAG）。OpenAI 默认 text-embedding-3-small，硅基流动可用 BAAI/bge-m3 等。不支持 Embedding 的服务商将无法建索引。
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
                    aria-label={showTtsKey ? "隐藏 TTS Key" : "显示 TTS Key"}
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
                  onChange={(e) => {
                    setTtsApiBase(e.target.value)
                    setTtsApiBaseError("")
                  }}
                />
                {ttsApiBaseError && <p className="text-xs text-destructive">{ttsApiBaseError}</p>}
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

        {/* ─── Section: AI 个性 / Persona ─── */}
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconRobot className="size-4 text-primary" />
            AI 个性
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            自定义 AI 助手的行为风格和称呼方式，对所有对话生效。
          </p>

          <div className="space-y-2">
            <Label htmlFor="user-name">你的昵称</Label>
            <Input
              id="user-name"
              placeholder="你的名字"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="persona-prompt">AI 行为提示词</Label>
            <Textarea
              id="persona-prompt"
              placeholder="例如：请用简洁专业的风格回答，避免使用过多表情。偏好用英文回答技术问题。"
              value={personaPrompt}
              onChange={(e) => setPersonaPrompt(e.target.value)}
              rows={3}
              maxLength={500}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                可以指定 AI 的回答风格、语言偏好、专业领域等。留空则使用默认行为。
              </p>
              <span className="text-xs text-muted-foreground">{personaPrompt.length}/500</span>
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
                    aria-label={showImageKey ? "隐藏生图 Key" : "显示生图 Key"}
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
                  onChange={(e) => {
                    setImageApiBase(e.target.value)
                    setImageApiBaseError("")
                  }}
                />
                {imageApiBaseError && <p className="text-xs text-destructive">{imageApiBaseError}</p>}
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
