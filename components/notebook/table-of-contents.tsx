"use client"

import * as React from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
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

// ─── Component ───

export function TableOfContents({ content }: { content: string }) {
  const headings = React.useMemo(() => extractHeadings(content), [content])
  const [activeId, setActiveId] = React.useState<string>("")
  const [open, setOpen] = React.useState(true)

  React.useEffect(() => {
    if (headings.length === 0) return

    const scrollContainer = document.getElementById("doc-content-scroll")
    if (!scrollContainer) return

    const handleScroll = () => {
      const headingElements = headings
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
    <Collapsible open={open} onOpenChange={setOpen} className="sticky top-0 h-fit shrink-0">
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
            <ul className="w-full space-y-0.5">
              {headings.map((heading, i) => (
                <li key={`${heading.id}-${i}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`#${heading.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          const scrollContainer = document.getElementById("doc-content-scroll")
                          const target = scrollContainer?.querySelector(`#${CSS.escape(heading.id)}`)
                          if (target) {
                            target.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
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
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
