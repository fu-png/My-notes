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
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ─── Types ───

interface ReadingStep {
  id: number
  title: string
  subtitle: string
  icon: React.ReactNode
  description: string
  action: string
  tips: string[]
}

interface ReadingNote {
  stepId: number
  content: string
  timestamp: number
}

// ─── Step definitions ───

const READING_STEPS: ReadingStep[] = [
  {
    id: 1,
    title: "全局扫读",
    subtitle: "建立骨架",
    icon: <IconScan className="size-4" />,
    description:
      "快速浏览标题、小标题、开头结尾、图表和加粗文字，在脑中搭建文章的整体框架。",
    action: "浏览文章结构，了解大意",
    tips: [
      "关注各级标题，理解文章分几个部分",
      "快速扫一遍开头和结尾段落",
      "注意图表、加粗文字等视觉重点",
    ],
  },
  {
    id: 2,
    title: "带着问题读",
    subtitle: "聚焦注意力",
    icon: <IconQuestionMark className="size-4" />,
    description:
      "根据扫读印象给自己提 2-3 个问题，带着问题正式阅读。大脑从接收模式切换到搜索模式。",
    action: "写下你的问题，然后开始精读",
    tips: [
      "这篇文章想解决什么问题？",
      "作者的核心观点是什么？",
      "这个方法和我已知的有什么不同？",
    ],
  },
  {
    id: 3,
    title: "复述关键点",
    subtitle: "用自己的话总结",
    icon: <IconMessageCircle className="size-4" />,
    description:
      "读完后停下来，用自己的语言总结关键内容。说不清楚的地方，恰好说明还没真正理解。",
    action: "用自己的话写下核心要点",
    tips: [
      "不要照抄原文，用自己的话表达",
      "每个要点控制在 1-2 句话",
      "说不清的地方回头再看",
    ],
  },
  {
    id: 4,
    title: "建立连接",
    subtitle: "关联已有知识",
    icon: <IconConnect className="size-4" />,
    description:
      "把新知识和你已有的知识、经验联系起来。和知识网络产生连接的信息会变得更牢固。",
    action: "写下你联想到的经验或知识",
    tips: [
      "这让我想到了哪个实际场景？",
      "和我之前学过的什么知识相关？",
      "能否举一个自己的例子？",
    ],
  },
  {
    id: 5,
    title: "输出验证",
    subtitle: "费曼学习法",
    icon: <IconPencil className="size-4" />,
    description:
      "尝试把学到的内容讲给别人听。如果能让对方理解，说明你真正掌握了。这是吸收的最后一环。",
    action: "写一段总结，假装讲给朋友听",
    tips: [
      "用最简单的语言解释核心概念",
      "避免使用专业术语，用比喻代替",
      "想象对方完全不了解这个领域",
    ],
  },
]

// ─── Reading Mode Panel Component ───

interface ReadingModePanelProps {
  content: string
  onClose: () => void
}

export function ReadingModePanel({ content, onClose }: ReadingModePanelProps) {
  const [currentStep, setCurrentStep] = React.useState(0)
  const [notes, setNotes] = React.useState<ReadingNote[]>([])
  const [currentNote, setCurrentNote] = React.useState("")
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(
    new Set()
  )
  const [started, setStarted] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Extract article structure for step 1
  const articleStructure = React.useMemo(() => {
    const headings: { level: number; text: string }[] = []
    const lines = content.split("\n")
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].replace(/[*_`~\[\]]/g, "").trim(),
        })
      }
    }
    return headings
  }, [content])

  // Word count for context
  const wordCount = React.useMemo(() => {
    const chinese = (content.match(/[\u4e00-\u9fff]/g) || []).length
    const english = (
      content.match(/[a-zA-Z]+/g) || []
    ).length
    return chinese + english
  }, [content])

  const estimatedMinutes = Math.max(1, Math.ceil(wordCount / 400))

  const progress = started
    ? Math.round((completedSteps.size / READING_STEPS.length) * 100)
    : 0

  const step = READING_STEPS[currentStep]

  const handleSaveNote = () => {
    if (!currentNote.trim()) return
    const note: ReadingNote = {
      stepId: step.id,
      content: currentNote.trim(),
      timestamp: Date.now(),
    }
    setNotes((prev) => [...prev, note])
    setCompletedSteps((prev) => new Set([...prev, step.id]))
    setCurrentNote("")

    // Auto advance to next step
    if (currentStep < READING_STEPS.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 300)
    }
  }

  const handleSkipStep = () => {
    setCompletedSteps((prev) => new Set([...prev, step.id]))
    setCurrentNote("")
    if (currentStep < READING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSaveNote()
    }
  }

  // Focus textarea on step change
  React.useEffect(() => {
    if (started && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [currentStep, started])

  // ─── Welcome screen ───
  if (!started) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <IconBook className="size-4 text-primary" />
            <span className="text-sm font-medium">阅读模式</span>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <IconX className="size-4" />
          </Button>
        </div>

        {/* Welcome content */}
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <IconSparkles className="size-8 text-primary" />
          </div>
          <h3 className="mb-2 text-base font-medium">五步精读法</h3>
          <p className="mb-6 max-w-xs text-center text-sm text-muted-foreground">
            通过扫读、提问、复述、连接、输出五个步骤，引导你主动阅读，深度吸收文章内容。
          </p>
          <div className="mb-6 w-full max-w-xs space-y-2.5">
            {READING_STEPS.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.subtitle}
                  </div>
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

  // ─── Active reading mode ───
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
            <span className="text-[11px] text-muted-foreground">
              {completedSteps.size}/{READING_STEPS.length}
            </span>
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
              <IconX className="size-4" />
            </Button>
          </div>
        </div>
        <Progress value={progress} className="h-0.5" />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-1 border-b px-4 py-2.5">
        {READING_STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCurrentStep(i)}
                  className={`flex size-7 items-center justify-center rounded-full text-xs transition-all ${
                    i === currentStep
                      ? "bg-primary text-primary-foreground"
                      : completedSteps.has(s.id)
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {completedSteps.has(s.id) ? (
                    <IconCheck className="size-3.5" />
                  ) : (
                    s.id
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{s.title}</TooltipContent>
            </Tooltip>
            {i < READING_STEPS.length - 1 && (
              <div
                className={`h-px w-4 ${
                  completedSteps.has(s.id)
                    ? "bg-primary/40"
                    : "bg-border"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Current step content */}
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

        {/* Description */}
        <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
          {step.description}
        </p>

        {/* Step 1: Show article structure */}
        {step.id === 1 && articleStructure.length > 0 && (
          <div className="mb-4 rounded-md border bg-muted/20 p-3">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              文章结构
            </div>
            <div className="space-y-1">
              {articleStructure.map((h, i) => (
                <div
                  key={i}
                  className="text-[12px] text-foreground/80"
                  style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                >
                  <span className="mr-1.5 text-muted-foreground">
                    {"#".repeat(h.level)}
                  </span>
                  {h.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="mb-4 rounded-md border bg-muted/20 p-3">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
            {step.id === 2 ? "可以思考的问题" : "小贴士"}
          </div>
          <div className="space-y-1.5">
            {step.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[12px] text-foreground/80"
              >
                <span className="mt-0.5 text-primary">•</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Note input */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground">
            {step.action}
          </label>
          <textarea
            ref={textareaRef}
            value={currentNote}
            onChange={(e) => setCurrentNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              step.id === 1
                ? "写下你对文章结构的理解…"
                : step.id === 2
                  ? "写下你想弄清楚的问题…"
                  : step.id === 3
                    ? "用自己的话总结核心要点…"
                    : step.id === 4
                      ? "写下联想到的经验或知识…"
                      : "用最简单的话讲给朋友听…"
            }
            className="min-h-[100px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              ⌘+Enter 保存
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={handleSkipStep}
              >
                跳过
              </Button>
              <Button
                size="sm"
                className="gap-1 text-xs"
                onClick={handleSaveNote}
                disabled={!currentNote.trim()}
              >
                <IconCheck className="size-3.5" />
                完成
              </Button>
            </div>
          </div>
        </div>

        {/* Previous notes for this step */}
        {notes.filter((n) => n.stepId === step.id).length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground">
              你的笔记
            </div>
            {notes
              .filter((n) => n.stepId === step.id)
              .map((note, i) => (
                <div
                  key={i}
                  className="rounded-md border bg-primary/5 px-3 py-2 text-[12px] text-foreground/80"
                >
                  {note.content}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          <IconChevronLeft className="size-3.5" />
          上一步
        </Button>
        {currentStep === READING_STEPS.length - 1 &&
        completedSteps.size === READING_STEPS.length ? (
          <Button size="sm" className="gap-1 text-xs" onClick={onClose}>
            <IconCheck className="size-3.5" />
            完成精读
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() =>
              setCurrentStep(
                Math.min(READING_STEPS.length - 1, currentStep + 1)
              )
            }
            disabled={currentStep === READING_STEPS.length - 1}
          >
            下一步
            <IconChevronRight className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Completion celebration */}
      {completedSteps.size === READING_STEPS.length && (
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

// ─── Reading Mode Toggle Button ───

interface ReadingModeButtonProps {
  onClick: () => void
  active: boolean
}

export function ReadingModeButton({ onClick, active }: ReadingModeButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "default" : "ghost"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={onClick}
        >
          <IconBook className="size-3.5" />
          精读
        </Button>
      </TooltipTrigger>
      <TooltipContent>{active ? "退出精读模式" : "进入精读模式"}</TooltipContent>
    </Tooltip>
  )
}
