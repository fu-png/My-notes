"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function NewProjectForm() {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError("请输入笔记本名称")
      return
    }
    if (trimmed.length > 100) {
      setError("名称不能超过 100 个字符")
      return
    }
    // 禁止特殊字符（与文件名规则保持一致）
    if (/[\\/:*?"<>|]/.test(trimmed)) {
      setError("名称不能包含特殊字符 / \\ : * ? \" < > |")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        router.push(`/docs/projects/${data.project.id}`)
        router.refresh()
      } else {
        // 503 表示服务端存储未配置
        const isConfigError = res.status === 503
        setError(
          isConfigError
            ? "服务端存储未配置，请联系管理员在 Vercel Dashboard 中创建 Blob Store"
            : (data.error || "创建失败，请重试")
        )
      }
    } catch {
      setError("网络错误，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
      <div className="absolute left-6 top-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <IconArrowLeft className="size-4" />
          返回
        </Button>
      </div>
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-sm px-6">
          <div className="mb-6 text-center">
            <h1 className="mb-1 text-xl font-bold tracking-tight">新建笔记本</h1>
            <p className="text-sm text-muted-foreground">
              起一个名字，马上开始记录
            </p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError("")
              }}
              placeholder="例如：Claude Code 读书笔记"
              autoFocus
              maxLength={100}
              className="h-11"
              disabled={loading}
              aria-label="项目名称"
            />
            {error && (
              <p className="mt-1.5 text-xs text-destructive" role="alert">{error}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full"
            size="lg"
          >
            {loading && <IconLoader2 className="size-4 animate-spin" />}
            创建并进入
          </Button>
        </form>
        </div>
      </div>
    </div>
  )
}
