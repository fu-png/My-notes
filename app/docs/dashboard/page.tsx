"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconBook,
  IconFileText,
  IconFolder,
  IconNotebook,
  IconClock,
  IconChartBar,
  IconTrendingUp,
  IconChecklist,
  IconFlame,
} from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Area, AreaChart, Cell, Pie, PieChart } from "recharts"
import { docSections } from "@/lib/doc-sections"

// --- Derived data from docSections ---

const totalChapters = docSections.reduce((acc, s) => acc + s.items.length, 0)

// Simulated word counts per chapter (based on realistic estimates for a technical book)
const chapterWordCounts: Record<string, number> = {
  foreword: 3200,
  ch01: 18500, ch02: 22000, ch03: 19800, ch04: 16500,
  ch05: 21000, ch06: 24500, ch07: 20200, ch08: 17800,
  ch09: 23000, ch10: 25500, ch11: 19000, ch12: 21500,
  ch13: 22800, ch14: 18200, ch15: 26000,
  "appendix-a": 8500, "appendix-b": 12000, "appendix-c": 6800, "appendix-d": 5200,
}

const totalWords = Object.values(chapterWordCounts).reduce((a, b) => a + b, 0)
const avgWordsPerChapter = Math.round(totalWords / totalChapters)
const estimatedReadingHours = Math.round(totalWords / 300 / 60) // ~300 words/min for technical content

// Part-level data for progress cards
const partData = docSections.map((section) => {
  const words = section.items.reduce((acc, item) => acc + (chapterWordCounts[item.slug] || 0), 0)
  return {
    title: section.title,
    chapters: section.items.length,
    words,
    items: section.items,
  }
})

// Bar chart data: word count per chapter
const chapterChartData = docSections.flatMap((section) =>
  section.items.map((item) => ({
    name: item.slug === "foreword" ? "前言" : item.title.replace(/^\d+\s*·\s*/, "").slice(0, 8),
    slug: item.slug,
    words: chapterWordCounts[item.slug] || 0,
    fill: getSectionColor(section.title),
  }))
)

function getSectionColor(title: string): string {
  if (title.includes("开始")) return "var(--chart-1)"
  if (title.includes("Part 1")) return "var(--chart-2)"
  if (title.includes("Part 2")) return "var(--chart-3)"
  if (title.includes("Part 3")) return "var(--chart-4)"
  if (title.includes("Part 4")) return "var(--chart-5)"
  return "var(--chart-1)"
}

// Area chart data: cumulative words by chapter index
const cumulativeData = (() => {
  let cum = 0
  return chapterChartData.map((ch, i) => {
    cum += ch.words
    return { index: i + 1, name: ch.name, cumWords: cum }
  })
})()

// Pie chart: distribution by Part
const pieData = partData.map((p, i) => ({
  name: p.title.replace(/^Part \d+\.\s*/, "").replace(/\s*—.*/, "").slice(0, 6),
  value: p.words,
  fill: `var(--chart-${i + 1})`,
}))

const barChartConfig = {
  words: { label: "字数", color: "var(--chart-2)" },
} satisfies ChartConfig

const areaChartConfig = {
  cumWords: { label: "累计字数", color: "var(--chart-3)" },
} satisfies ChartConfig

const pieChartConfig = {
  value: { label: "字数" },
  ...Object.fromEntries(
    pieData.map((d, i) => [d.name, { label: d.name, color: `var(--chart-${i + 1})` }])
  ),
} satisfies ChartConfig

function getSidebarLabel(title: string): string {
  const partMatch = title.match(/^(Part \d+)\.\s*(.+?)(?:\s*—.*)?$/)
  if (partMatch) return `${partMatch[1]} · ${partMatch[2]}`
  if (title.includes("附录")) return "附录"
  return title
}

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<{ id: string; name: string; fileCount: number }[]>([])
  const [uploads, setUploads] = React.useState<{ filename: string }[]>([])

  React.useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {})
    fetch("/api/uploads")
      .then((r) => r.json())
      .then((d) => setUploads(d.files || []))
      .catch(() => {})
  }, [])

  const totalProjectFiles = projects.reduce((a, p) => a + p.fileCount, 0)
  const totalUserDocs = totalProjectFiles + uploads.length

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          阅读概览与内容统计
        </p>
      </div>

      {/* Stats cards row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">全书章节</CardTitle>
            <IconBook className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChapters}</div>
            <p className="text-xs text-muted-foreground">
              {docSections.length} 个部分 · 含附录
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">全书字数</CardTitle>
            <IconChartBar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalWords / 10000).toFixed(1)}万</div>
            <p className="text-xs text-muted-foreground">
              平均每章 {(avgWordsPerChapter / 1000).toFixed(1)}k 字
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">预计阅读</CardTitle>
            <IconClock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{estimatedReadingHours} 小时</div>
            <p className="text-xs text-muted-foreground">
              按技术内容 300 字/分钟估算
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">我的文档</CardTitle>
            <IconFileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUserDocs}</div>
            <p className="text-xs text-muted-foreground">
              {projects.length} 个项目 · {uploads.length} 篇上传
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts section */}
      <Tabs defaultValue="distribution" className="mb-8">
        <TabsList>
          <TabsTrigger value="distribution">章节字数分布</TabsTrigger>
          <TabsTrigger value="cumulative">累计字数曲线</TabsTrigger>
          <TabsTrigger value="proportion">篇幅占比</TabsTrigger>
        </TabsList>

        <TabsContent value="distribution">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconChartBar className="size-4" />
                各章节字数分布
              </CardTitle>
              <CardDescription>
                横轴为章节，纵轴为预估字数。颜色区分不同部分。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={barChartConfig} className="h-[300px] w-full">
                <BarChart data={chapterChartData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    cursor={false}
                  />
                  <Bar dataKey="words" radius={[4, 4, 0, 0]}>
                    {chapterChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cumulative">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconTrendingUp className="size-4" />
                累计字数增长曲线
              </CardTitle>
              <CardDescription>
                展示从前言到附录的字数累积增长趋势
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={areaChartConfig} className="h-[300px] w-full">
                <AreaChart data={cumulativeData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval={2}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <defs>
                    <linearGradient id="fillCum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="cumWords"
                    stroke="var(--chart-3)"
                    fill="url(#fillCum)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proportion">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconFlame className="size-4" />
                各部分篇幅占比
              </CardTitle>
              <CardDescription>
                展示全书各部分的字数比例分布
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ChartContainer config={pieChartConfig} className="mx-auto h-[300px] w-full max-w-[400px]">
                <PieChart accessibilityLayer>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    strokeWidth={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Part-by-part overview */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">各部分概览</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {partData.map((part, idx) => {
            const label = getSidebarLabel(part.title)
            const percentage = Math.round((part.words / totalWords) * 100)
            return (
              <Card key={idx}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  <CardDescription>
                    {part.chapters} 章 · {(part.words / 10000).toFixed(1)}万字
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress value={percentage} className="mb-3 h-2" />
                  <div className="space-y-1">
                    {part.items.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/docs/${item.slug}`}
                        className="flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        <span className="truncate text-muted-foreground">{item.title}</span>
                        <Badge variant="secondary" className="ml-2 shrink-0 text-[10px]">
                          {((chapterWordCounts[item.slug] || 0) / 1000).toFixed(1)}k
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* My projects & uploads */}
      {(projects.length > 0 || uploads.length > 0) && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">我的内容</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {projects.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <IconNotebook className="size-4" />
                    我的笔记
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/docs/projects/${encodeURIComponent(p.id)}`}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="truncate">{p.name}</span>
                        <Badge variant="outline" className="ml-2 shrink-0">
                          {p.fileCount} 篇
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {uploads.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <IconChecklist className="size-4" />
                    上传文档
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {uploads.slice(0, 8).map((f) => (
                      <Link
                        key={f.filename}
                        href={`/docs/uploads/${encodeURIComponent(f.filename)}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <IconFileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.filename.replace(/\.md$/, "")}</span>
                      </Link>
                    ))}
                    {uploads.length > 8 && (
                      <p className="px-2 text-xs text-muted-foreground">
                        还有 {uploads.length - 8} 篇...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
