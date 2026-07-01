"use client"

import * as React from "react"
import {
  IconBook,
  IconX,
  IconChevronRight,
  IconChevronLeft,
  IconScan,
  IconQuestionMark,
  IconMessageCircle,
  IconLink as IconConnect,
  IconPencil,
  IconCheck,
  IconSparkles,
  IconPlayerPlay,
  IconPlayerPause,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ─── Types ───

interface ReadingNote {
  stepId: number
  sectionIndex?: number
  content: string
  timestamp: number
}

/** A section is a heading + all content until the next same-or-higher heading */
interface Section {
  index: number
  title: string
  level: number
  /** The DOM element of this heading inside the scroll container */
  element: HTMLElement | null
}

// ─── Constants ───

const SPEED_LABELS = ["慢速", "适中", "快速", "极速"] as const
/** px per animation-frame tick at each speed level */
const SPEED_VALUES = [0.15, 0.35, 0.7, 1.2] as const

const STEP_META = [
  {
    id: 1,
    title: "全局扫读",
    subtitle: "建立骨架",
    icon: <IconScan className="size-4" />,
    description: "快速浏览标题、小标题、开头结尾、图表和加粗文字，在脑中搭建文章的整体框架。",
    tips: ["关注各级标题，理解文章分几个部分", "快速扫一遍开头和结尾段落", "注意图表、加粗文字等视觉重点"],
  },
  {
    id: 2,
    title: "带着问题读",
    subtitle: "聚焦注意力",
    icon: <IconQuestionMark className="size-4" />,
    description: "根据扫读印象给自己提 2-3 个问题，带着问题正式阅读。大脑从接收模式切换到搜索模式。",
    tips: ["这篇文章想解决什么问题？", "作者的核心观点是什么？", "这个方法和我已知的有什么不同？"],
  },
  {
    id: 3,
    title: "逐段精读",
    subtitle: "自动滚动 + 逐段复述",
    icon: <IconMessageCircle className="size-4" />,
    description: "文章自动滚动阅读，每到一个小节结束时暂停，让你用自己的话复述关键点。",
    tips: ["不要照抄原文，用自己的话表达", "说不清的地方回头再看", "可随时暂停/调速"],
  },
  {
    id: 4,
    title: "建立连接",
    subtitle: "关联已有知识",
    icon: <IconConnect className="size-4" />,
    description: "把新知识和你已有的知识、经验联系起来。和知识网络产生连接的信息会变得更牢固。",
    tips: ["这让我想到了哪个实际场景？", "和我之前学过的什么知识相关？", "能否举一个自己的例子？"],
  },
  {
    id: 5,
    title: "输出验证",
    subtitle: "费曼学习法",
    icon: <IconPencil className="size-4" />,
    description: "尝试把学到的内容讲给别人听。如果能让对方理解，说明你真正掌握了。这是吸收的最后一环。",
    tips: ["用最简单的语言解释核心概念", "避免使用专业术语，用比喻代替", "想象对方完全不了解这个领域"],
  },
]

// ─── Reading Mode Panel Component ───

/** Persisted reading session data */
interface ReadingSession {
  currentStep: number
  completedSteps: number[]
  notes: ReadingNote[]
  started: boolean
  updatedAt: number
}

function getStorageKey(fileKey: string) {
  return `reading-mode:${fileKey}`
}

function loadSession(fileKey: string): ReadingSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(getStorageKey(fileKey))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(fileKey: string, session: ReadingSession) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(getStorageKey(fileKey), JSON.stringify(session))
  } catch { /* quota exceeded — silent */ }
}

interface ReadingModePanelProps {
  content: string
  /** Unique key for persistence, e.g. `${projectId}/${filename}` */
  fileKey: string
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

export function ReadingModePanel({
  content,
  fileKey,
  scrollContainerRef,
  onClose,
}: ReadingModePanelProps) {
  // ── restore from localStorage
  const saved = React.useMemo(() => loadSession(fileKey), [fileKey])

  // ── global state
  const [currentStep, setCurrentStep] = React.useState(saved?.currentStep ?? 0)
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(
    new Set(saved?.completedSteps ?? [])
  )
  const [notes, setNotes] = React.useState<ReadingNote[]>(saved?.notes ?? [])
  const [started, setStarted] = React.useState(saved?.started ?? false)

  // ── persist on change
  React.useEffect(() => {
    saveSession(fileKey, {
      currentStep,
      completedSteps: Array.from(completedSteps),
      notes,
      started,
      updatedAt: Date.now(),
    })
  }, [fileKey, currentStep, completedSteps, notes, started])

  // ── step-local input
  const [currentNote, setCurrentNote] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // ── step 3 (auto-scroll reading) state
  const [scrolling, setScrolling] = React.useState(false)
  const [speedLevel, setSpeedLevel] = React.useState(0)
  const [scrollProgress, setScrollProgress] = React.useState(0)
  const [sections, setSections] = React.useState<Section[]>([])
  const [activeSectionIdx, setActiveSectionIdx] = React.useState(0)
  const [pausedForNote, setPausedForNote] = React.useState(false)
  const [sectionNote, setSectionNote] = React.useState("")
  const sectionNoteRef = React.useRef<HTMLTextAreaElement>(null)
  const animRef = React.useRef<number | null>(null)
  const scrollingRef = React.useRef(false)
  const scrollPosRef = React.useRef(0)

  // ── derived
  const step = STEP_META[currentStep]

  const articleStructure = React.useMemo(() => {
    const headings: { level: number; text: string }[] = []
    for (const line of content.split("\n")) {
      const m = line.match(/^(#{1,6})\s+(.+)$/)
      if (m) headings.push({ level: m[1].length, text: m[2].replace(/[*_`~\[\]]/g, "").trim() })
    }
    return headings
  }, [content])

  const wordCount = React.useMemo(() => {
    const cn = (content.match(/[\u4e00-\u9fff]/g) || []).length
    const en = (content.match(/[a-zA-Z]+/g) || []).length
    return cn + en
  }, [content])

  const estimatedMinutes = Math.max(1, Math.ceil(wordCount / 400))
  const overallProgress = started ? Math.round((completedSteps.size / STEP_META.length) * 100) : 0

  // ──────────────────────────────────────
  // Section detection — scan rendered DOM for headings
  // ──────────────────────────────────────
  const detectSections = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const article = container.querySelector("article")
    if (!article) return
    const headingEls = article.querySelectorAll("h1, h2, h3, h4")
    const result: Section[] = []
    headingEls.forEach((el, i) => {
      const level = parseInt(el.tagName[1], 10)
      result.push({ index: i, title: el.textContent?.trim() || "", level, element: el as HTMLElement })
    })
    setSections(result)
  }, [scrollContainerRef])

  // Re-detect when entering step 3
  React.useEffect(() => {
    if (started && step.id === 3) {
      // Delay to ensure markdown is rendered
      const t = setTimeout(detectSections, 200)
      return () => clearTimeout(t)
    }
  }, [started, step.id, detectSections])

  // ──────────────────────────────────────
  // Auto-scroll engine
  // ──────────────────────────────────────
  const startScrolling = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    scrollPosRef.current = container.scrollTop
    scrollingRef.current = true
    setScrolling(true)

    const tick = () => {
      if (!scrollingRef.current) return
      const ct = container
      const maxScroll = ct.scrollHeight - ct.clientHeight
      if (maxScroll <= 0) {
        // Content fits without scroll — auto-complete
        scrollingRef.current = false
        setScrolling(false)
        setScrollProgress(100)
        return
      }

      scrollPosRef.current += SPEED_VALUES[speedLevel]
      ct.scrollTo({ top: scrollPosRef.current })
      const pct = Math.min(100, (scrollPosRef.current / maxScroll) * 100)
      setScrollProgress(pct)

      // Check if we've passed a section heading — pause for note
      if (sections.length > 0) {
        const containerRect = ct.getBoundingClientRect()
        // The "reading line" is 40% down the visible viewport
        const readingLineY = containerRect.top + containerRect.height * 0.4

        for (let i = sections.length - 1; i >= 0; i--) {
          const sec = sections[i]
          if (!sec.element) continue
          const rect = sec.element.getBoundingClientRect()
          // When the heading crosses above the reading line, that section is "active"
          if (rect.top < readingLineY) {
            if (i > activeSectionIdx) {
              // We just passed a new section boundary → pause
              setActiveSectionIdx(i)
              scrollingRef.current = false
              setScrolling(false)
              setPausedForNote(true)
              return
            }
            break
          }
        }
      }

      // Reached the bottom
      if (ct.scrollTop >= maxScroll - 1) {
        scrollingRef.current = false
        setScrolling(false)
        setScrollProgress(100)
        return
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
  }, [scrollContainerRef, speedLevel, sections, activeSectionIdx])

  const pauseScrolling = React.useCallback(() => {
    scrollingRef.current = false
    setScrolling(false)
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
  }, [])

  const toggleScrolling = React.useCallback(() => {
    if (scrolling) {
      pauseScrolling()
    } else {
      startScrolling()
    }
  }, [scrolling, pauseScrolling, startScrolling])

  // Speed change while scrolling → restart with new speed
  const changeSpeed = React.useCallback(
    (delta: number) => {
      setSpeedLevel((prev) => {
        const next = Math.max(0, Math.min(SPEED_VALUES.length - 1, prev + delta))
        return next
      })
    },
    []
  )

  // When speed changes and we're scrolling, restart the animation loop
  React.useEffect(() => {
    if (scrolling) {
      pauseScrolling()
      // Micro-delay so state flushes
      const t = setTimeout(() => startScrolling(), 16)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedLevel])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      scrollingRef.current = false
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // Highlight active section heading
  React.useEffect(() => {
    if (step.id !== 3) return
    // Clear all highlights first
    sections.forEach((s) => {
      if (s.element) {
        s.element.style.removeProperty("background-color")
        s.element.style.removeProperty("border-radius")
        s.element.style.removeProperty("padding-left")
        s.element.style.removeProperty("margin-left")
        s.element.style.removeProperty("transition")
      }
    })
    // Apply highlight to active
    const active = sections[activeSectionIdx]
    if (active?.element) {
      active.element.style.setProperty("background-color", "hsl(var(--primary) / 0.08)")
      active.element.style.setProperty("border-radius", "4px")
      active.element.style.setProperty("padding-left", "8px")
      active.element.style.setProperty("margin-left", "-8px")
      active.element.style.setProperty("transition", "all 0.3s ease")
    }
    return () => {
      sections.forEach((s) => {
        if (s.element) {
          s.element.style.removeProperty("background-color")
          s.element.style.removeProperty("border-radius")
          s.element.style.removeProperty("padding-left")
          s.element.style.removeProperty("margin-left")
          s.element.style.removeProperty("transition")
        }
      })
    }
  }, [step.id, sections, activeSectionIdx])

  // ──────────────────────────────────────
  // Handle section note save (during auto-scroll pause)
  // ──────────────────────────────────────
  const handleSectionNoteSave = () => {
    if (sectionNote.trim()) {
      setNotes((prev) => [
        ...prev,
        { stepId: 3, sectionIndex: activeSectionIdx, content: sectionNote.trim(), timestamp: Date.now() },
      ])
    }
    setSectionNote("")
    setPausedForNote(false)
    // Resume scrolling after a brief pause
    setTimeout(() => startScrolling(), 300)
  }

  const handleSkipSectionNote = () => {
    setSectionNote("")
    setPausedForNote(false)
    setTimeout(() => startScrolling(), 100)
  }

  // ──────────────────────────────────────
  // Generic note save (steps 1, 2, 4, 5)
  // ──────────────────────────────────────
  const handleSaveNote = () => {
    if (!currentNote.trim()) return
    setNotes((prev) => [...prev, { stepId: step.id, content: currentNote.trim(), timestamp: Date.now() }])
    setCompletedSteps((prev) => new Set([...prev, step.id]))
    setCurrentNote("")
    if (currentStep < STEP_META.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 300)
    }
  }


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSaveNote()
    }
  }

  // Navigate to step — only allow going to already-completed steps or the current one
  const goToStep = React.useCallback(
    (idx: number) => {
      // Can only go back to completed steps, not forward to uncompleted ones
      const targetStep = STEP_META[idx]
      if (!targetStep) return
      if (idx > currentStep && !completedSteps.has(STEP_META[currentStep].id)) return
      if (idx > currentStep && !completedSteps.has(targetStep.id) && idx !== currentStep + 1) return
      if (step.id === 3) {
        pauseScrolling()
        setPausedForNote(false)
        setSectionNote("")
      }
      setCurrentNote("")
      setCurrentStep(idx)
    },
    [step.id, currentStep, completedSteps, pauseScrolling]
  )

  // Mark step 3 complete
  const finishStep3 = () => {
    pauseScrolling()
    setPausedForNote(false)
    setCompletedSteps((prev) => new Set([...prev, 3]))
    if (currentStep < STEP_META.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 300)
    }
  }

  // Auto-focus textarea
  React.useEffect(() => {
    if (started && textareaRef.current) textareaRef.current.focus()
  }, [currentStep, started])

  React.useEffect(() => {
    if (pausedForNote && sectionNoteRef.current) sectionNoteRef.current.focus()
  }, [pausedForNote])

  // Scroll to top when entering step 3
  React.useEffect(() => {
    if (started && step.id === 3) {
      const container = scrollContainerRef.current
      if (container) container.scrollTop = 0
      scrollPosRef.current = 0
      setScrollProgress(0)
      setActiveSectionIdx(0)
    }
  }, [started, step.id, scrollContainerRef])

  // ─────────────────────────────────
  // RENDER — Welcome screen
  // ─────────────────────────────────
  if (!started) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <IconBook className="size-4 text-primary" />
            <span className="text-sm font-medium">阅读模式</span>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <IconX className="size-4" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <IconSparkles className="size-8 text-primary" />
          </div>
          <h3 className="mb-2 text-base font-medium">五步精读法</h3>
          <p className="mb-6 max-w-xs text-center text-sm text-muted-foreground">
            通过扫读、提问、自动精读、连接、输出五个步骤，引导你主动阅读，深度吸收文章内容。
          </p>
          <div className="mb-6 w-full max-w-xs space-y-2.5">
            {STEP_META.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground">{s.subtitle}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mb-4 text-[11px] text-muted-foreground">
            全文约 {wordCount} 字 · 预计精读 {estimatedMinutes} 分钟
          </div>
          <Button onClick={() => setStarted(true)} className="gap-2">
            <IconPlayerPlay className="size-4" />
            开始精读
          </Button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────
  // RENDER — Active steps
  // ─────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header with progress */}
      <div className="border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <IconBook className="size-4 text-primary" />
            <span className="text-sm font-medium">精读模式</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{completedSteps.size}/{STEP_META.length}</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
              <IconX className="size-4" />
            </Button>
          </div>
        </div>
        <Progress value={overallProgress} className="h-0.5" />
      </div>

      {/* Step indicator dots */}
      <div className="flex items-center justify-center gap-1 border-b px-4 py-2.5">
        {STEP_META.map((s, i) => (
          <React.Fragment key={s.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => goToStep(i)}
                  disabled={i > currentStep && !completedSteps.has(s.id)}
                  className={`flex size-7 items-center justify-center rounded-full text-xs transition-all ${
                    i === currentStep
                      ? "bg-primary text-primary-foreground"
                      : completedSteps.has(s.id)
                        ? "bg-primary/20 text-primary cursor-pointer"
                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  }`}
                >
                  {completedSteps.has(s.id) ? <IconCheck className="size-3.5" /> : s.id}
                </button>
              </TooltipTrigger>
              <TooltipContent>{s.title}</TooltipContent>
            </Tooltip>
            {i < STEP_META.length - 1 && (
              <div className={`h-px w-4 ${completedSteps.has(s.id) ? "bg-primary/40" : "bg-border"}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Step header */}
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              {step.icon}
            </div>
            <div>
              <h4 className="text-sm font-medium">{step.title}</h4>
              <p className="text-[11px] text-muted-foreground">{step.subtitle}</p>
            </div>
          </div>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">{step.description}</p>

        {/* ──── Step 1: Scan ──── */}
        {step.id === 1 && (
          <>
            {articleStructure.length > 0 && (
              <div className="mb-4 rounded-md border bg-muted/20 p-3">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">文章结构</div>
                <div className="space-y-1">
                  {articleStructure.map((h, i) => (
                    <div key={i} className="text-[12px] text-foreground/80" style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                      <span className="mr-1.5 text-muted-foreground">{"#".repeat(h.level)}</span>
                      {h.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <StepTips tips={step.tips} />
            <NoteInput
              ref={textareaRef}
              value={currentNote}
              onChange={setCurrentNote}
              onKeyDown={handleKeyDown}
              placeholder="写下你对文章结构的理解…"
              action="浏览文章结构，了解大意"
              onSave={handleSaveNote}
            />
            <PreviousNotes notes={notes} stepId={1} />
          </>
        )}

        {/* ──── Step 2: Questions ──── */}
        {step.id === 2 && (
          <>
            <StepTips tips={step.tips} label="可以思考的问题" />
            <NoteInput
              ref={textareaRef}
              value={currentNote}
              onChange={setCurrentNote}
              onKeyDown={handleKeyDown}
              placeholder="写下你想弄清楚的问题…"
              action="写下你的问题，然后进入精读"
              onSave={handleSaveNote}
            />
            <PreviousNotes notes={notes} stepId={2} />
          </>
        )}

        {/* ──── Step 3: Auto-scroll reading ──── */}
        {step.id === 3 && (
          <>
            {/* Reading progress */}
            <div className="mb-4 rounded-md border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">阅读进度</span>
                <span className="text-[11px] text-muted-foreground">{Math.round(scrollProgress)}%</span>
              </div>
              <Progress value={scrollProgress} className="mb-3 h-1.5" />

              {/* Speed control */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">滚动速度</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => changeSpeed(-1)}
                    disabled={speedLevel === 0}
                  >
                    <IconMinus className="size-3" />
                  </Button>
                  <span className="w-8 text-center text-[11px] font-medium">{SPEED_LABELS[speedLevel]}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => changeSpeed(1)}
                    disabled={speedLevel === SPEED_VALUES.length - 1}
                  >
                    <IconPlus className="size-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Play / Pause */}
            {!pausedForNote && (
              <div className="mb-4 flex items-center justify-center">
                <Button variant={scrolling ? "outline" : "default"} className="gap-2" onClick={toggleScrolling}>
                  {scrolling ? (
                    <>
                      <IconPlayerPause className="size-4" />
                      暂停阅读
                    </>
                  ) : (
                    <>
                      <IconPlayerPlay className="size-4" />
                      {scrollProgress > 0 ? "继续阅读" : "开始阅读"}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Section list with active indicator */}
            {sections.length > 0 && !pausedForNote && (
              <div className="mb-4 rounded-md border bg-muted/20 p-3">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">章节导航</div>
                <div className="space-y-1">
                  {sections.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (s.element) {
                          s.element.scrollIntoView({ behavior: "smooth", block: "start" })
                          setActiveSectionIdx(i)
                        }
                      }}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors ${
                        i === activeSectionIdx
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground/60 hover:bg-muted/50 hover:text-foreground/80"
                      }`}
                      style={{ paddingLeft: `${(s.level - 1) * 10 + 8}px` }}
                    >
                      {i < activeSectionIdx && <IconCheck className="size-3 shrink-0 text-primary/60" />}
                      {i === activeSectionIdx && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className="truncate">{s.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Section-level note prompt (when paused at section boundary) */}
            {pausedForNote && (
              <div className="mb-4 rounded-md border-2 border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-primary" />
                  <span className="text-[12px] font-medium">
                    {sections[activeSectionIdx]?.title || `第 ${activeSectionIdx + 1} 节`} — 暂停复述
                  </span>
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  刚读完一个小节，停下来用自己的话复述一下关键点吧。
                </p>
                <textarea
                  ref={sectionNoteRef}
                  value={sectionNote}
                  onChange={(e) => setSectionNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleSectionNoteSave()
                    }
                  }}
                  placeholder="用自己的话复述这一节的要点…"
                  className="mb-2 min-h-[80px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">⌘+Enter 保存</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1 text-xs" onClick={handleSectionNoteSave}>
                      <IconCheck className="size-3.5" />
                      保存 & 继续
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Section notes collected so far */}
            <PreviousNotes notes={notes} stepId={3} sections={sections} />

            {/* Complete step 3 button */}
            {scrollProgress >= 99 && !scrolling && !pausedForNote && (
              <div className="flex items-center justify-center pt-2">
                <Button size="sm" className="gap-1.5 text-xs" onClick={finishStep3}>
                  <IconCheck className="size-3.5" />
                  精读完成，进入下一步
                </Button>
              </div>
            )}
          </>
        )}

        {/* ──── Step 4: Connect ──── */}
        {step.id === 4 && (
          <>
            <StepTips tips={step.tips} />
            <NoteInput
              ref={textareaRef}
              value={currentNote}
              onChange={setCurrentNote}
              onKeyDown={handleKeyDown}
              placeholder="写下联想到的经验或知识…"
              action="写下你联想到的经验或知识"
              onSave={handleSaveNote}
            />
            <PreviousNotes notes={notes} stepId={4} />
          </>
        )}

        {/* ──── Step 5: Output ──── */}
        {step.id === 5 && (
          <>
            <StepTips tips={step.tips} />
            <NoteInput
              ref={textareaRef}
              value={currentNote}
              onChange={setCurrentNote}
              onKeyDown={handleKeyDown}
              placeholder="用最简单的话讲给朋友听…"
              action="写一段总结，假装讲给朋友听"
              onSave={handleSaveNote}
            />
            <PreviousNotes notes={notes} stepId={5} />
          </>
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => goToStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          <IconChevronLeft className="size-3.5" />
          上一步
        </Button>
        {currentStep === STEP_META.length - 1 && completedSteps.size === STEP_META.length ? (
          <Button size="sm" className="gap-1 text-xs" onClick={onClose}>
            <IconCheck className="size-3.5" />
            完成精读
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => goToStep(Math.min(STEP_META.length - 1, currentStep + 1))}
            disabled={currentStep === STEP_META.length - 1 || !completedSteps.has(step.id)}
          >
            下一步
            <IconChevronRight className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Completion celebration */}
      {completedSteps.size === STEP_META.length && (
        <div className="border-t bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <IconSparkles className="size-4 text-primary" />
            <div>
              <div className="text-xs font-medium">精读完成！</div>
              <div className="text-[11px] text-muted-foreground">
                你已经完成了五步精读法的全部步骤，共记录了 {notes.length} 条笔记。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───

function StepTips({ tips, label }: { tips: string[]; label?: string }) {
  return (
    <div className="mb-4 rounded-md border bg-muted/20 p-3">
      <div className="mb-2 text-[11px] font-medium text-muted-foreground">{label || "小贴士"}</div>
      <div className="space-y-1.5">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px] text-foreground/80">
            <span className="mt-0.5 text-primary">•</span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface NoteInputProps {
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  placeholder: string
  action: string
  onSave: () => void
}

const NoteInput = React.forwardRef<HTMLTextAreaElement, NoteInputProps>(
  ({ value, onChange, onKeyDown, placeholder, action, onSave }, ref) => (
    <div className="space-y-2">
      <label className="text-[11px] font-medium text-muted-foreground">{action}</label>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="min-h-[100px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center justify-end">
        <Button size="sm" className="gap-1 text-xs" onClick={onSave} disabled={!value.trim()}>
          <IconCheck className="size-3.5" />
          完成
        </Button>
      </div>
    </div>
  )
)
NoteInput.displayName = "NoteInput"

function PreviousNotes({
  notes,
  stepId,
  sections,
}: {
  notes: ReadingNote[]
  stepId: number
  sections?: Section[]
}) {
  const filtered = notes.filter((n) => n.stepId === stepId)
  if (filtered.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground">你的笔记</div>
      {filtered.map((note, i) => (
        <div key={i} className="rounded-md border bg-primary/5 px-3 py-2">
          {note.sectionIndex != null && sections && sections[note.sectionIndex] && (
            <div className="mb-1 text-[10px] font-medium text-primary/70">
              {sections[note.sectionIndex].title}
            </div>
          )}
          <div className="text-[12px] text-foreground/80">{note.content}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Reading Mode Toggle Button ───

interface ReadingModeButtonProps {
  onClick: () => void
  active: boolean
}

export function ReadingModeButton({ onClick, active }: ReadingModeButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={active ? "default" : "ghost"} size="sm" className="gap-1.5 text-xs" onClick={onClick}>
          <IconBook className="size-3.5" />
          精读
        </Button>
      </TooltipTrigger>
      <TooltipContent>{active ? "退出精读模式" : "进入精读模式"}</TooltipContent>
    </Tooltip>
  )
}
