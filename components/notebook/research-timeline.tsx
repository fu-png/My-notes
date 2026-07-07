"use client"

import * as React from "react"
import {
  IconMapRoute,
  IconWorldSearch,
  IconBrain,
  IconFileText,
  IconDeviceFloppy,
  IconRobot,
  IconLoader2,
  IconCheck,
  IconExternalLink,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ResearchStepDetail } from "@/lib/deep-research/types"

interface ResearchStep {
  phase: string
  step: string
  progress: number
  detail?: ResearchStepDetail
  timestamp: number
}

interface ResearchTimelineProps {
  steps: ResearchStep[]
  isRunning: boolean
}

const PHASE_CONFIG: Record<string, { icon: typeof IconRobot; label: string; badgeVariant: "default" | "secondary" | "outline" }> = {
  plan:       { icon: IconMapRoute,     label: "规划智能体",  badgeVariant: "default" },
  search:     { icon: IconWorldSearch,  label: "搜索智能体",  badgeVariant: "default" },
  reflect:    { icon: IconBrain,        label: "评估智能体",  badgeVariant: "default" },
  synthesize: { icon: IconFileText,     label: "生成智能体",  badgeVariant: "default" },
  save:       { icon: IconDeviceFloppy, label: "保存智能体",  badgeVariant: "default" },
}

function StepDetailContent({ detail }: { detail: ResearchStepDetail }) {
  const [pathOpen, setPathOpen] = React.useState(true)

  return (
    <div className="space-y-2 text-xs">
      {/* 摘要 */}
      {detail.summary && (
        <p className="text-muted-foreground leading-relaxed">{detail.summary}</p>
      )}

      {/* Plan: 学习路径 */}
      {detail.learningPath && detail.learningPath.length > 0 && (
        <Collapsible open={pathOpen} onOpenChange={setPathOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <IconMapRoute className="size-3" />
            <span>学习路径</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {detail.learningPath.length} 个阶段
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1.5">
              {detail.learningPath.map((path, i) => (
                <Card key={i} size="sm" className="bg-muted/30">
                  <CardContent className="flex items-start gap-2 py-2">
                    <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px] font-bold tabular-nums">
                      {i + 1}
                    </Badge>
                    <div className="min-w-0">
                      <span className="font-medium text-foreground/90">{path.stage}</span>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70 leading-relaxed">
                        {path.topics.join("、")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Plan: 子问题 */}
      {detail.subQuestions && detail.subQuestions.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <IconBrain className="size-3" />
            <span>拆解子问题</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {detail.subQuestions.length} 个
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5 space-y-1 pl-1">
              {detail.subQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-1.5 text-muted-foreground/80 leading-relaxed">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/30" />
                  {q}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Search: 来源 */}
      {detail.sources && detail.sources.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <IconWorldSearch className="size-3" />
            <span>参考来源</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {detail.sources.length} 个
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5 space-y-1 pl-1">
              {detail.sources.map((source, i) => (
                <div key={i} className="flex items-center gap-1.5 text-muted-foreground/80">
                  <IconExternalLink className="size-3 shrink-0" />
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-foreground hover:underline transition-colors"
                    title={source.url}
                  >
                    {source.title || source.url}
                  </a>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Reflect: 覆盖度 */}
      {detail.coverage !== undefined && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">知识覆盖度</span>
            <Badge variant={detail.coverage >= 0.7 ? "default" : "outline"} className="text-[10px] tabular-nums">
              {Math.round(detail.coverage * 100)}%
            </Badge>
            {detail.isSufficient && (
              <Badge variant="default" className="text-[10px]">
                <IconCheck className="size-2.5" /> 已达标
              </Badge>
            )}
          </div>
          <Progress value={Math.round(detail.coverage * 100)} className="h-1.5" />
        </div>
      )}

      {/* Reflect: 知识盲区 */}
      {detail.knowledgeGaps && detail.knowledgeGaps.length > 0 && !detail.isSufficient && (
        <div>
          <div className="flex items-center gap-1.5">
            <Badge variant="destructive" className="text-[10px]">知识盲区</Badge>
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-1">
            {detail.knowledgeGaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-1.5 text-muted-foreground/80 leading-relaxed">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-destructive/50" />
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Synthesize: 文档列表 */}
      {detail.docTitles && detail.docTitles.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <IconFileText className="size-3" />
            <span>生成笔记</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {detail.docTitles.length} 篇
            </Badge>
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-1">
            {detail.docTitles.map((title, i) => (
              <li key={i} className="flex items-start gap-1.5 text-muted-foreground/80">
                <IconFileText className="mt-0.5 size-3 shrink-0 text-primary/60" />
                {title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ResearchTimeline({ steps, isRunning }: ResearchTimelineProps) {
  if (!steps || steps.length === 0) return null

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1
        const isActive = isLast && isRunning
        const config = PHASE_CONFIG[step.phase]
        const Icon = config?.icon || IconRobot

        return (
          <div key={`${step.phase}-${index}`} className="relative flex gap-3">
            {/* 时间线连接线 */}
            {!isLast && (
              <div className="absolute left-[13px] top-[26px] bottom-0 w-px bg-border" />
            )}

            {/* 图标节点 */}
            <div className={`relative z-10 mt-0.5 flex size-[27px] shrink-0 items-center justify-center rounded-full border ${
              isActive
                ? "border-primary bg-background"
                : "border-border bg-muted/50"
            }`}>
              {isActive ? (
                <IconLoader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <Icon className="size-3.5 text-muted-foreground" />
              )}
            </div>

            {/* 内容区 */}
            <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-4"}`}>
              {/* 标题行 */}
              <div className="flex items-center gap-2">
                <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
                  <Icon className="size-2.5" />
                  {step.detail?.agentLabel || config?.label || step.phase}
                </Badge>
                {!isActive && (
                  <IconCheck className="size-3.5 text-green-500" />
                )}
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/50 tabular-nums">
                  {step.progress}%
                </span>
              </div>

              {/* 步骤描述 */}
              <CardDescription className="mt-1">
                {step.step}
              </CardDescription>

              {/* 详细信息 */}
              {step.detail && (
                <>
                  <Separator className="my-2" />
                  <StepDetailContent detail={step.detail} />
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* 运行中的等待指示 */}
      {isRunning && (
        <div className="relative flex gap-3">
          <div className="relative z-10 mt-0.5 flex size-[27px] shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-background">
            <div className="size-1.5 animate-pulse rounded-full bg-primary/40" />
          </div>
          <div className="flex items-center pb-1">
            <span className="text-xs text-muted-foreground/50">等待下一阶段…</span>
          </div>
        </div>
      )}
    </div>
  )
}
