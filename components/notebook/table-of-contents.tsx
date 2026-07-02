"use client"

import * as React from "react"
import { IconChevronLeft, IconChevronRight, IconList, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// ─── Heading extraction ───

interface TocItem {
  id: string
  text: string
  level: number
}

function extractHeadings(markdown: string): TocItem[] {
  const headings: TocItem[] = []
  const lines = markdown.split("\n")
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/[*_`~\[\]]/g, "").trim()
      const id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
      headings.push({ id, text, level })
    }
  }
  return headings
}

// ─── Shared TOC list ───

function TocList({
  headings,
  activeId,
  minLevel,
  onClickHeading,
}: {
  headings: TocItem[]
  activeId: string
  minLevel: number
  onClickHeading?: (id: string) => void
}) {
  return (
    <ul className="w-full space-y-0.5">
      {headings.map((heading, i) => (
        <li key={`${heading.id}-${i}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`#${heading.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  if (!heading.id) return
                  const scrollContainer = document.getElementById("doc-content-scroll")
                  const target = scrollContainer?.querySelector(`#${CSS.escape(heading.id)}`)
                  if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  onClickHeading?.(heading.id)
                }}
                className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap py-1.5 pr-2 text-[13px] leading-normal transition-colors ${
                  activeId === heading.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
                style={{ paddingLeft: `${(heading.level - minLevel) * 12 + 8}px` }}
              >
                {heading.text}
              </a>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-60">
              {heading.text}
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

// ─── Component ───

export function TableOfContents({ content }: { content: string }) {
  const headings = React.useMemo(() => extractHeadings(content), [content])
  const [activeId, setActiveId] = React.useState<string>("")
  const [open, setOpen] = React.useState(true)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    if (headings.length === 0) return

    const scrollContainer = document.getElementById("doc-content-scroll")
    if (!scrollContainer) return

    const handleScroll = () => {
      const headingElements = headings
        .filter((h) => h.id) // 过滤掉没有 id 的 heading，避免 querySelector('#') 报错
        .map((h) => ({ id: h.id, el: scrollContainer.querySelector(`#${CSS.escape(h.id)}`) }))
        .filter((h) => h.el !== null)

      let current = ""
      for (const { id, el } of headingElements) {
        const rect = el!.getBoundingClientRect()
        const containerRect = scrollContainer.getBoundingClientRect()
        if (rect.top - containerRect.top <= 80) {
          current = id
        }
      }
      setActiveId(current)
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => scrollContainer.removeEventListener("scroll", handleScroll)
  }, [headings])

  if (headings.length < 2) return null

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <>
      {/* Desktop: sidebar collapsible TOC */}
      <Collapsible open={open} onOpenChange={setOpen} className="sticky top-0 hidden h-fit shrink-0 md:block">
        <div className={`flex flex-col border-r transition-all ${open ? "w-64" : "w-10"}`}>
          {/* 标题栏 */}
          <div className={`flex items-center border-b px-2 py-[9px] ${open ? "justify-between" : "justify-center"}`}>
            {open && (
              <span className="pl-1 text-sm font-medium text-foreground">目录</span>
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                {open ? (
                  <IconChevronLeft className="size-4" />
                ) : (
                  <IconChevronRight className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>

          {/* 目录内容 */}
          <CollapsibleContent>
            <div className="h-[calc(100vh-8rem)] overflow-y-auto overflow-x-hidden p-3">
              <TocList headings={headings} activeId={activeId} minLevel={minLevel} />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Mobile: floating button + overlay panel */}
      <div className="md:hidden">
        {/* Floating toggle button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed bottom-20 right-4 z-50 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
          aria-label="展开目录"
        >
          {mobileOpen ? <IconX className="size-5" /> : <IconList className="size-5" />}
        </button>

        {/* Floating TOC panel */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed bottom-32 right-4 z-50 w-64 max-h-[50vh] overflow-y-auto rounded-lg border bg-background p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">目录</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <IconX className="size-4" />
                </button>
              </div>
              <TocList
                headings={headings}
                activeId={activeId}
                minLevel={minLevel}
                onClickHeading={() => setMobileOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
