"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  IconX,
  IconRobot,
  IconVolume,
  IconPhoto,
  IconPalette,
  IconKey,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
const STORAGE_KEY_PROVIDERS = "ai-assistant-providers"
const STORAGE_KEY_ACTIVE_PROVIDER = "ai-assistant-active-provider"

const STORAGE_KEY_TTS_API_KEY = "ai-tts-api-key"
const STORAGE_KEY_TTS_API_BASE = "ai-tts-api-base"
const STORAGE_KEY_TTS_MODEL = "ai-tts-model"
const STORAGE_KEY_TTS_VOICE_HOST = "ai-tts-voice-host"
const STORAGE_KEY_TTS_VOICE_EXPERT = "ai-tts-voice-expert"

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

// ─── Provider Config Type ───

interface ProviderConfig {
  id: string
  preset: string
  apiKey: string
  apiBase: string
  model: string
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ─── Navigation ───

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "AI 模型",
    items: [
      { id: "chat", label: "对话模型", icon: IconRobot },
      { id: "tts", label: "语音合成", icon: IconVolume },
      { id: "image", label: "图像生成", icon: IconPhoto },
    ],
  },
  {
    title: "偏好设置",
    items: [
      { id: "appearance", label: "外观", icon: IconPalette },
    ],
  },
]

// ─── Settings Dialog Component ───

interface SettingsPageProps {
  onClose: () => void
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = React.useState("chat")
  const [saved, setSaved] = React.useState(false)

  // ─── 多服务商配置 ───
  const [providers, setProviders] = React.useState<ProviderConfig[]>([])
  const [activeProviderId, setActiveProviderId] = React.useState("")
  const [editingProviderId, setEditingProviderId] = React.useState<string | null>(null)

  // TTS 配置
  const [showTtsKey, setShowTtsKey] = React.useState(false)
  const [ttsApiKey, setTtsApiKey] = React.useState("")
  const [ttsApiBase, setTtsApiBase] = React.useState("")
  const [ttsModel, setTtsModel] = React.useState(DEFAULT_TTS_MODEL)
  const [ttsVoiceHost, setTtsVoiceHost] = React.useState(DEFAULT_TTS_VOICE_HOST)
  const [ttsVoiceExpert, setTtsVoiceExpert] = React.useState(DEFAULT_TTS_VOICE_EXPERT)
  const [useSameKey, setUseSameKey] = React.useState(true)

  // 生图模型配置
  const [showImageKey, setShowImageKey] = React.useState(false)
  const [imageApiKey, setImageApiKey] = React.useState("")
  const [imageApiBase, setImageApiBase] = React.useState(DEFAULT_IMAGE_API_BASE)
  const [imageModel, setImageModel] = React.useState(DEFAULT_IMAGE_MODEL)
  const [useSameImageKey, setUseSameImageKey] = React.useState(true)

  // Load config
  React.useEffect(() => {
    // 读取多服务商配置
    const savedProviders = localStorage.getItem(STORAGE_KEY_PROVIDERS)
    const savedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROVIDER)

    if (savedProviders) {
      try {
        const parsed = JSON.parse(savedProviders) as ProviderConfig[]
        setProviders(parsed)
        if (savedActiveId && parsed.find((p) => p.id === savedActiveId)) {
          setActiveProviderId(savedActiveId)
          setEditingProviderId(savedActiveId)
        } else if (parsed.length > 0) {
          setActiveProviderId(parsed[0].id)
          setEditingProviderId(parsed[0].id)
        }
      } catch { /* ignore */ }
    } else {
      // 兼容旧配置：从旧的单配置迁移
      const oldKey = localStorage.getItem(STORAGE_KEY_API_KEY) || ""
      const oldBase = localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE
      const oldModel = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
      if (oldKey) {
        const detectedPreset = PROVIDER_PRESETS.find((p) => p.apiBase === oldBase)?.name || "自定义"
        const migratedProvider: ProviderConfig = {
          id: generateId(),
          preset: detectedPreset,
          apiKey: oldKey,
          apiBase: oldBase,
          model: oldModel,
        }
        setProviders([migratedProvider])
        setActiveProviderId(migratedProvider.id)
        setEditingProviderId(migratedProvider.id)
      }
    }

    // TTS
    const savedTtsKey = localStorage.getItem(STORAGE_KEY_TTS_API_KEY) || ""
    setTtsApiKey(savedTtsKey)
    setTtsApiBase(localStorage.getItem(STORAGE_KEY_TTS_API_BASE) || "")
    setTtsModel(localStorage.getItem(STORAGE_KEY_TTS_MODEL) || DEFAULT_TTS_MODEL)
    setTtsVoiceHost(localStorage.getItem(STORAGE_KEY_TTS_VOICE_HOST) || DEFAULT_TTS_VOICE_HOST)
    setTtsVoiceExpert(localStorage.getItem(STORAGE_KEY_TTS_VOICE_EXPERT) || DEFAULT_TTS_VOICE_EXPERT)
    setUseSameKey(!savedTtsKey)

    // Image
    const savedImageKey = localStorage.getItem(STORAGE_KEY_IMAGE_API_KEY) || ""
    setImageApiKey(savedImageKey)
    setImageApiBase(localStorage.getItem(STORAGE_KEY_IMAGE_API_BASE) || DEFAULT_IMAGE_API_BASE)
    setImageModel(localStorage.getItem(STORAGE_KEY_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL)
    setUseSameImageKey(!savedImageKey)
  }, [])

  // ESC 关闭
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Provider helpers
  const addProvider = () => {
    const newProvider: ProviderConfig = {
      id: generateId(),
      preset: "自定义",
      apiKey: "",
      apiBase: "",
      model: "",
    }
    setProviders((prev) => [...prev, newProvider])
    setEditingProviderId(newProvider.id)
  }

  const removeProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id))
    if (activeProviderId === id) {
      const remaining = providers.filter((p) => p.id !== id)
      setActiveProviderId(remaining.length > 0 ? remaining[0].id : "")
    }
    if (editingProviderId === id) {
      const remaining = providers.filter((p) => p.id !== id)
      setEditingProviderId(remaining.length > 0 ? remaining[0].id : null)
    }
  }

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    )
  }

  const handleSave = () => {
    // 保存多服务商配置
    localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(providers))
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROVIDER, activeProviderId)

    // 同步当前激活的配置到旧 key（兼容其他组件）
    const activeProvider = providers.find((p) => p.id === activeProviderId)
    if (activeProvider) {
      localStorage.setItem(STORAGE_KEY_API_KEY, activeProvider.apiKey.trim())
      localStorage.setItem(STORAGE_KEY_API_BASE, activeProvider.apiBase.trim() || DEFAULT_API_BASE)
      localStorage.setItem(STORAGE_KEY_MODEL, activeProvider.model.trim() || DEFAULT_MODEL)
    }

    // TTS
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

    // Image
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
    setTimeout(() => setSaved(false), 2000)
  }

  const hasValidActiveProvider = providers.some((p) => p.id === activeProviderId && p.apiKey.trim())

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex h-[min(720px,88vh)] w-[min(960px,92vw)] overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Nav */}
        <nav className="flex w-[180px] shrink-0 flex-col border-r bg-muted/30">
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-foreground">设置</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.title} className={gi > 0 ? "mt-5" : ""}>
                <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground/60">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                        activeSection === item.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Right Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-3">
            <h3 className="text-[15px] font-medium">
              {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeSection)?.label || "设置"}
            </h3>
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconX className="size-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeSection === "chat" && (
              <SectionChat
                providers={providers}
                activeProviderId={activeProviderId}
                editingProviderId={editingProviderId}
                setActiveProviderId={setActiveProviderId}
                setEditingProviderId={setEditingProviderId}
                addProvider={addProvider}
                removeProvider={removeProvider}
                updateProvider={updateProvider}
              />
            )}
            {activeSection === "tts" && (
              <SectionTTS
                useSameKey={useSameKey} setUseSameKey={setUseSameKey}
                ttsApiKey={ttsApiKey} setTtsApiKey={setTtsApiKey}
                ttsApiBase={ttsApiBase} setTtsApiBase={setTtsApiBase}
                ttsModel={ttsModel} setTtsModel={setTtsModel}
                ttsVoiceHost={ttsVoiceHost} setTtsVoiceHost={setTtsVoiceHost}
                ttsVoiceExpert={ttsVoiceExpert} setTtsVoiceExpert={setTtsVoiceExpert}
                showTtsKey={showTtsKey} setShowTtsKey={setShowTtsKey}
              />
            )}
            {activeSection === "image" && (
              <SectionImage
                useSameImageKey={useSameImageKey} setUseSameImageKey={setUseSameImageKey}
                imageApiKey={imageApiKey} setImageApiKey={setImageApiKey}
                imageApiBase={imageApiBase} setImageApiBase={setImageApiBase}
                imageModel={imageModel} setImageModel={setImageModel}
                showImageKey={showImageKey} setShowImageKey={setShowImageKey}
              />
            )}
            {activeSection === "appearance" && <SectionAppearance />}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={!hasValidActiveProvider} className="min-w-[80px]">
              {saved ? (
                <span className="flex items-center gap-1">
                  <IconCheck className="size-3.5" />
                  已保存
                </span>
              ) : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Section: 对话模型（多服务商卡片式） ───

function SectionChat({
  providers, activeProviderId, editingProviderId,
  setActiveProviderId, setEditingProviderId,
  addProvider, removeProvider, updateProvider,
}: {
  providers: ProviderConfig[]
  activeProviderId: string
  editingProviderId: string | null
  setActiveProviderId: (id: string) => void
  setEditingProviderId: (id: string | null) => void
  addProvider: () => void
  removeProvider: (id: string) => void
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">管理 AI 对话模型服务商，支持配置多个并切换使用。</p>
        <Button size="sm" className="shrink-0 gap-1" onClick={addProvider}>
          <IconPlus className="size-3.5" />
          添加服务商
        </Button>
      </div>

      {/* Provider Cards */}
      {providers.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <p className="text-sm text-muted-foreground">还没有配置服务商，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isExpanded={editingProviderId === provider.id}
              canDelete={providers.length > 1}
              onToggleExpand={() => setEditingProviderId(editingProviderId === provider.id ? null : provider.id)}
              onRemove={() => removeProvider(provider.id)}
              onUpdate={(updates) => updateProvider(provider.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Provider Card ───

function ProviderCard({
  provider, isExpanded, canDelete,
  onToggleExpand, onRemove, onUpdate,
}: {
  provider: ProviderConfig
  isExpanded: boolean
  canDelete: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onUpdate: (updates: Partial<ProviderConfig>) => void
}) {
  const [showKey, setShowKey] = React.useState(false)

  // 根据 API Base URL 自动识别服务商
  const detectedPreset = React.useMemo(() => {
    const base = provider.apiBase.trim()
    if (!base) return null
    return PROVIDER_PRESETS.find((p) => p.apiBase && base.includes(p.apiBase.replace(/^https?:\/\//, "").split("/")[0])) || null
  }, [provider.apiBase])

  // 快捷填充：点击预设服务商按钮
  const applyPreset = (presetName: string) => {
    const presetConfig = PROVIDER_PRESETS.find((p) => p.name === presetName)
    if (!presetConfig || !presetConfig.apiBase) return
    const updates: Partial<ProviderConfig> = {
      apiBase: presetConfig.apiBase,
      preset: presetName,
    }
    if (presetConfig.models.length > 0 && !provider.model) {
      updates.model = presetConfig.models[0]
    }
    onUpdate(updates)
  }

  // 卡片标题：模型名
  const cardTitle = provider.model || "未配置模型"
  // 副标题：识别到的服务商名 或 apiBase 或提示
  const cardSubtitle = detectedPreset
    ? detectedPreset.name
    : (provider.apiBase || "未配置地址")

  return (
    <div className={`rounded-lg border transition-colors ${isExpanded ? "bg-muted/20" : ""}`}>
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5"
        onClick={onToggleExpand}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">{cardTitle}</span>
          </div>
          {!isExpanded && (
            <p className="truncate text-[11px] text-muted-foreground">
              {cardSubtitle}
              {!provider.apiKey && " · 需要配置 Key"}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canDelete && (
            <button
              className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              title="删除"
            >
              <IconTrash className="size-3.5" />
            </button>
          )}
          <svg
            className={`size-4 text-muted-foreground/50 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3">
          {/* API Base URL + 快捷预设 */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">API Base URL</Label>
            <Input
              type="url"
              placeholder={DEFAULT_API_BASE}
              value={provider.apiBase}
              onChange={(e) => {
                const newBase = e.target.value
                const matched = PROVIDER_PRESETS.find((p) => p.apiBase && newBase.includes(p.apiBase.replace(/^https?:\/\//, "").split("/")[0]))
                onUpdate({
                  apiBase: newBase,
                  preset: matched?.name || "自定义",
                  ...(matched && matched.models.length > 0 && !provider.model ? { model: matched.models[0] } : {}),
                })
              }}
              className="h-8 text-sm"
            />
            {/* 快捷预设按钮 */}
            <div className="flex flex-wrap gap-1">
              {PROVIDER_PRESETS.filter((p) => p.apiBase).map((p) => (
                <button
                  key={p.name}
                  className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                    detectedPreset?.name === p.name
                      ? "bg-primary/10 text-primary font-medium"
                      : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                  onClick={() => applyPreset(p.name)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <IconKey className="size-3" />
              API Key
            </Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={provider.apiKey}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                className="h-8 pr-8 text-sm"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="space-y-1">
            <Label className="text-[12px] text-muted-foreground">模型</Label>
            <Input
              placeholder="输入模型名称"
              value={provider.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Section: 语音合成 ───

function SectionTTS({
  useSameKey, setUseSameKey,
  ttsApiKey, setTtsApiKey,
  ttsApiBase, setTtsApiBase,
  ttsModel, setTtsModel,
  ttsVoiceHost, setTtsVoiceHost,
  ttsVoiceExpert, setTtsVoiceExpert,
  showTtsKey, setShowTtsKey,
}: {
  useSameKey: boolean; setUseSameKey: (v: boolean) => void
  ttsApiKey: string; setTtsApiKey: (v: string) => void
  ttsApiBase: string; setTtsApiBase: (v: string) => void
  ttsModel: string; setTtsModel: (v: string) => void
  ttsVoiceHost: string; setTtsVoiceHost: (v: string) => void
  ttsVoiceExpert: string; setTtsVoiceExpert: (v: string) => void
  showTtsKey: boolean; setShowTtsKey: (v: boolean) => void
}) {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">用于音频概述的双人对话语音合成。若不配置，将使用浏览器内置朗读。</p>

      <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
        <div>
          <p className="text-[13px] font-medium">复用对话模型 API Key</p>
          <p className="text-[11px] text-muted-foreground">开启后自动使用当前激活服务商的 Key 和地址</p>
        </div>
        <Switch checked={useSameKey} onCheckedChange={setUseSameKey} />
      </div>

      {!useSameKey && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
          <div className="space-y-1.5">
            <Label className="text-[13px]">TTS API Key</Label>
            <div className="relative">
              <Input
                type={showTtsKey ? "text" : "password"}
                placeholder="sk-..."
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                className="h-8 pr-8 text-sm"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowTtsKey(!showTtsKey)}
              >
                {showTtsKey ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">TTS API Base URL</Label>
            <Input
              type="url"
              placeholder={DEFAULT_API_BASE}
              value={ttsApiBase}
              onChange={(e) => setTtsApiBase(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      <FieldGroup label="TTS 模型" desc="支持 tts-1（快速）和 tts-1-hd（高清）">
        <Input
          placeholder="tts-1"
          value={ttsModel}
          onChange={(e) => setTtsModel(e.target.value)}
          className="h-8 text-sm"
        />
      </FieldGroup>

      <FieldGroup label="语音角色" desc="分别设置主持人和专家的语音">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">主持人</Label>
            <Select value={ttsVoiceHost} onValueChange={setTtsVoiceHost}>
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTS_VOICE_OPTIONS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">专家</Label>
            <Select value={ttsVoiceExpert} onValueChange={setTtsVoiceExpert}>
              <SelectTrigger className="h-8 w-full text-sm">
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
      </FieldGroup>
    </div>
  )
}

// ─── Section: 图像生成 ───

function SectionImage({
  useSameImageKey, setUseSameImageKey,
  imageApiKey, setImageApiKey,
  imageApiBase, setImageApiBase,
  imageModel, setImageModel,
  showImageKey, setShowImageKey,
}: {
  useSameImageKey: boolean; setUseSameImageKey: (v: boolean) => void
  imageApiKey: string; setImageApiKey: (v: string) => void
  imageApiBase: string; setImageApiBase: (v: string) => void
  imageModel: string; setImageModel: (v: string) => void
  showImageKey: boolean; setShowImageKey: (v: boolean) => void
}) {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">用于 AI 生成 PPT 幻灯片图片。推荐使用 GPT-Image-2 Pro 等图像模型。</p>

      <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
        <div>
          <p className="text-[13px] font-medium">复用对话模型 API Key</p>
          <p className="text-[11px] text-muted-foreground">开启后自动使用当前激活服务商的 Key</p>
        </div>
        <Switch checked={useSameImageKey} onCheckedChange={setUseSameImageKey} />
      </div>

      {!useSameImageKey && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
          <div className="space-y-1.5">
            <Label className="text-[13px]">生图 API Key</Label>
            <div className="relative">
              <Input
                type={showImageKey ? "text" : "password"}
                placeholder="sk-..."
                value={imageApiKey}
                onChange={(e) => setImageApiKey(e.target.value)}
                className="h-8 pr-8 text-sm"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowImageKey(!showImageKey)}
              >
                {showImageKey ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">生图 API Base URL</Label>
            <Input
              type="url"
              placeholder={DEFAULT_IMAGE_API_BASE}
              value={imageApiBase}
              onChange={(e) => setImageApiBase(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      <FieldGroup label="生图模型" desc="支持 gpt-image-2、gpt-image-2pro、dall-e-3 等">
        <Input
          placeholder="gpt-image-2"
          value={imageModel}
          onChange={(e) => setImageModel(e.target.value)}
          className="h-8 text-sm"
        />
      </FieldGroup>
    </div>
  )
}

// ─── Section: 外观 ───

function SectionAppearance() {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">自定义应用的视觉风格。</p>

      <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
        <div>
          <p className="text-[13px] font-medium">深色模式</p>
          <p className="text-[11px] text-muted-foreground">使用顶部导航栏的主题按钮切换</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">系统/手动</span>
      </div>
    </div>
  )
}

// ─── Shared Field Group ───

function FieldGroup({
  label,
  icon,
  desc,
  children,
}: {
  label: string
  icon?: React.ReactNode
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <Label className="flex items-center gap-1.5 text-[13px] font-medium">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          {label}
        </Label>
        {desc && <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  )
}
