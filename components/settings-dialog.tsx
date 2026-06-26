"use client"

import * as React from "react"
import {
  IconSettings,
  IconEye,
  IconEyeOff,
  IconCheck,
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

// ─── Storage Keys ───

const STORAGE_KEY_API_KEY = "ai-assistant-api-key"
const STORAGE_KEY_API_BASE = "ai-assistant-api-base"
const STORAGE_KEY_MODEL = "ai-assistant-model"

// ─── Defaults ───

const DEFAULT_API_BASE = "https://api.openai.com/v1"
const DEFAULT_MODEL = "gpt-4o-mini"


// ─── Utility Functions ───

export function getAIConfig() {
  if (typeof window === "undefined") return null
  const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY)
  const apiBase = localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE
  const model = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL
  if (!apiKey) return null
  return { apiKey, apiBase, model }
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
  const [apiKey, setApiKey] = React.useState("")
  const [apiBase, setApiBase] = React.useState(DEFAULT_API_BASE)
  const [model, setModel] = React.useState(DEFAULT_MODEL)
  const [showKey, setShowKey] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  // Load saved config on open
  React.useEffect(() => {
    if (open) {
      setApiKey(localStorage.getItem(STORAGE_KEY_API_KEY) || "")
      setApiBase(localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE)
      setModel(localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL)
      setSaved(false)
    }
  }, [open])

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim())
    localStorage.setItem(STORAGE_KEY_API_BASE, apiBase.trim() || DEFAULT_API_BASE)
    localStorage.setItem(STORAGE_KEY_MODEL, model.trim() || DEFAULT_MODEL)
    setSaved(true)
    // Dispatch a custom event so other components can react
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI 助手设置</DialogTitle>
          <DialogDescription>
            配置 AI 助手的 API Key 和模型，配置后即可使用 AI 对话功能。支持 OpenAI 兼容的 API 服务。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
              默认为 OpenAI 官方地址，也可配置为其他兼容服务（如 DeepSeek、Azure 等）。
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">模型</Label>
            <Input
              id="model"
              placeholder="输入模型名称，如 gpt-4o-mini、deepseek-chat"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              填写你接入的 API 支持的模型名称。
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
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
