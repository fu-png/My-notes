"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { SettingsDialog } from "@/components/settings-dialog"
import {
  IconSearch,
  IconFileText,
  IconLoader2,
  IconX,
} from "@tabler/icons-react"
import {
  TooltipProvider,
} from "@/components/ui/tooltip"

interface SearchResult {
  projectId: string
  projectName: string
  filename: string
  title: string
}

export function TopNav() {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 防抖搜索
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const query = search.trim()
    if (!query) {
      setResults([])
      setOpen(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results || [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // 点击外部关闭
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setSearch("")
    router.push(`/docs/projects/${encodeURIComponent(result.projectId)}?file=${encodeURIComponent(result.filename)}`)
  }

  // 键盘快捷键 Cmd+K / Ctrl+K
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape") {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 items-center justify-between gap-4 px-4">
        {/* Left side: Logo */}
        <Link href="/docs/projects" className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="My notes"
            width={120}
            height={45}
            className="h-8 w-auto dark:invert"
          />
        </Link>

        {/* Center: Search */}
        <div ref={containerRef} className="relative hidden w-full max-w-md md:block">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { if (search.trim() && results.length > 0) setOpen(true) }}
              placeholder="搜索文件… ⌘K"
              className="h-8 w-full rounded-md border-transparent bg-muted pl-8 pr-8 text-sm placeholder:text-muted-foreground/60 focus:bg-muted focus:outline-none"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setResults([]); setOpen(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {searching ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconX className="size-3.5" />}
              </button>
            )}
          </div>

          {/* 搜索结果下拉 */}
          {open && (
            <div className="absolute left-0 top-full mt-1 w-full rounded-md border bg-background shadow-lg">
              {results.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {searching ? "搜索中..." : "没有找到匹配的文件"}
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto py-1">
                  {results.map((r, i) => (
                    <button
                      key={`${r.projectId}-${r.filename}-${i}`}
                      onClick={() => handleSelect(r)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <IconFileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{r.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{r.projectName}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-1">
          {/* 移动端搜索按钮 */}
          <button
            onClick={() => inputRef.current?.focus()}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          >
            <IconSearch className="size-4" />
          </button>
          <TooltipProvider delayDuration={200}>
            <SettingsDialog />
          </TooltipProvider>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
