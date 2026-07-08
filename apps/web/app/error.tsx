"use client"

import { IconAlertTriangle, IconRefresh, IconHome } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <IconAlertTriangle className="size-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">页面加载出错</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message || "发生了意外错误，请尝试刷新页面。"}
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground/60">
            错误代码：{error.digest}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="default" className="gap-1.5">
          <IconRefresh className="size-4" />
          重试
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/docs/projects">
            <IconHome className="size-4" />
            返回首页
          </Link>
        </Button>
      </div>
    </div>
  )
}
