"use client"

import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  IconArrowRight,
  IconMessageChatbot,
  IconSearch,
  IconBook,
  IconFolderOpen,
  IconUpload,
  IconHeadphones,
  IconPresentation,
  IconSparkles,
  IconNotes,
  IconTrendingUp,
  IconUsers,
  IconFileText,
  IconClock,
} from "@tabler/icons-react"

export default function Home() {
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <div className="relative min-h-svh bg-background">
      {/* ─── Navigation ─── */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-transparent bg-white/80 backdrop-blur-md dark:bg-neutral-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="My Notes"
              width={120}
              height={36}
              className="h-8 w-auto dark:invert"
              priority
            />
          </div>
          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="/docs/dashboard" className="transition-colors hover:text-foreground">功能</Link>
            <Link href="/docs/projects" className="transition-colors hover:text-foreground">项目</Link>
            <Link href="/docs/uploads" className="transition-colors hover:text-foreground">文件</Link>
            <a href="#features" className="transition-colors hover:text-foreground">特性</a>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/docs/projects"
              className="hidden rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 sm:inline-flex"
            >
              进入应用
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative flex min-h-[92vh] flex-col items-center overflow-hidden pt-16">
        {/* Background image — positioned in the lower part */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/hero-bg.png"
            alt=""
            fill
            className="object-cover object-bottom"
            priority
          />
          {/* Top area: white fade so text is readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white/90 via-35% to-transparent dark:from-neutral-950 dark:via-neutral-950/90" />
          {/* Bottom fade: blend into next section */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent dark:from-neutral-950" />
        </div>

        {/* Content — positioned in the upper white area */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center pb-[25vh]">
          {/* User avatars */}
          <div className="mb-6 flex items-center">
            <div className="flex -space-x-2.5">
              {[
                "bg-emerald-500",
                "bg-blue-500",
                "bg-amber-500",
                "bg-rose-500",
              ].map((color, i) => (
                <div
                  key={i}
                  className={`flex size-9 items-center justify-center rounded-full border-2 border-white text-[11px] font-medium text-white shadow-sm dark:border-neutral-900 ${color}`}
                >
                  {["Z", "L", "W", "C"][i]}
                </div>
              ))}
              <div className="flex size-9 items-center justify-center rounded-full border-2 border-white bg-neutral-600 text-[11px] font-medium text-white shadow-sm dark:border-neutral-900">
                +800
              </div>
            </div>
          </div>

          {/* Main heading */}
          <h1 className="mb-4 text-center text-5xl font-extralight tracking-tight text-neutral-900 dark:text-white sm:text-6xl md:text-7xl lg:text-8xl">
            Explore More
          </h1>

          {/* Subheading */}
          <p className="mb-8 max-w-lg text-center text-base leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-lg">
            AI 驱动的个人笔记与知识管理平台，
            <br />
            让你的思考更有深度，知识更有体系。
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-medium text-neutral-900 transition-all hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
            >
              了解更多
            </a>
            <Link
              href="/docs/projects"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow-lg transition-all hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              开始使用
              <IconArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Feature Tags Bar ─── */}
      <section className="border-y border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 overflow-x-auto px-6 py-5">
          {[
            { icon: IconMessageChatbot, label: "AI 对话" },
            { icon: IconSearch, label: "RAG 检索" },
            { icon: IconBook, label: "阅读模式" },
            { icon: IconFolderOpen, label: "项目管理" },
            { icon: IconUpload, label: "文件上传" },
            { icon: IconHeadphones, label: "音频生成" },
            { icon: IconPresentation, label: "PPT 生成" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex shrink-0 items-center gap-2.5 text-muted-foreground"
            >
              <Icon className="size-5" strokeWidth={1.5} />
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Product Preview (Dashboard Mock) ─── */}
      <section className="bg-neutral-50 px-6 py-20 dark:bg-neutral-950">
        <div className="mx-auto max-w-5xl">
          {/* Browser frame */}
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-neutral-200/50 dark:shadow-neutral-900/50">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-border bg-neutral-50 px-4 py-3 dark:bg-neutral-900">
              <div className="flex gap-1.5">
                <div className="size-3 rounded-full bg-red-400" />
                <div className="size-3 rounded-full bg-amber-400" />
                <div className="size-3 rounded-full bg-green-400" />
              </div>
              <div className="ml-4 flex items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <IconNotes className="size-3.5" />
                  <span className="font-medium text-foreground">MyNotes</span>
                </div>
                <span className="cursor-default transition-colors hover:text-foreground">概览</span>
                <span className="cursor-default transition-colors hover:text-foreground">项目</span>
                <span className="cursor-default transition-colors hover:text-foreground">文件</span>
                <span className="cursor-default transition-colors hover:text-foreground">设置</span>
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span>User</span>
                <div className="flex size-6 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white">U</div>
              </div>
            </div>

            {/* Dashboard content */}
            <div className="p-6">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Dashboard</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>最近 30 天</span>
                  <button className="rounded-md border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent">
                    <IconClock className="mr-1 inline size-3" />
                    选择日期
                  </button>
                </div>
              </div>

              {/* Stats cards */}
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "总笔记数", value: "1,284", change: "+12.5%", icon: IconFileText },
                  { label: "AI 对话", value: "+386", change: "+21%", icon: IconMessageChatbot },
                  { label: "知识检索", value: "+2,156", change: "+10.5%", icon: IconSearch },
                  { label: "在线用户", value: "57", change: "+10.5%", icon: IconUsers },
                ].map(({ label, value, change, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <IconTrendingUp className="size-3" />
                      <span>{change} vs 上月</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom row */}
              <div className="grid gap-4 sm:grid-cols-5">
                {/* Chart area */}
                <div className="rounded-lg border border-border bg-background p-4 sm:col-span-3">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">概览</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      <IconTrendingUp className="mr-1 inline size-3" />
                      +23.5% vs 去年
                    </span>
                  </div>
                  {/* Simple chart visualization */}
                  <div className="flex h-32 items-end gap-2">
                    {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map(
                      (h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-neutral-200 transition-colors dark:bg-neutral-700"
                          style={{ height: `${h}%` }}
                        />
                      )
                    )}
                  </div>
                </div>

                {/* Recent activity */}
                <div className="rounded-lg border border-border bg-background p-4 sm:col-span-2">
                  <span className="mb-3 block text-sm font-medium text-foreground">最近活动</span>
                  <div className="space-y-3">
                    {[
                      { name: "RAG 知识检索", time: "今天 10:34", badge: "检索" },
                      { name: "AI 对话", time: "今天 09:15", badge: "对话" },
                      { name: "笔记编辑", time: "昨天 18:22", badge: "编辑" },
                    ].map(({ name, time, badge }) => (
                      <div key={name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                            <IconSparkles className="size-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-foreground">{name}</p>
                            <p className="text-[10px] text-muted-foreground">{time}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-neutral-800">
                          {badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-light tracking-tight text-foreground sm:text-4xl">
              为你的知识体系赋能
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              集成 AI 对话、智能检索、阅读模式、项目管理等多项核心能力，打造你的专属知识中枢。
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: IconMessageChatbot,
                title: "AI 智能对话",
                desc: "基于上下文的 AI 对话，帮助你深入思考、整理灵感，让笔记更有深度。",
              },
              {
                icon: IconSearch,
                title: "RAG 知识检索",
                desc: "结合向量搜索和 BM25 的混合检索引擎，在海量笔记中精准定位所需内容。",
              },
              {
                icon: IconBook,
                title: "沉浸阅读模式",
                desc: "专为长文阅读设计的沉浸式排版，让你专注于知识的消化吸收。",
              },
              {
                icon: IconFolderOpen,
                title: "项目化管理",
                desc: "用项目组织你的笔记和文件，清晰的层级结构让知识管理更有条理。",
              },
              {
                icon: IconHeadphones,
                title: "音频内容生成",
                desc: "将笔记转化为音频内容，支持多种场景的知识输出和分享。",
              },
              {
                icon: IconPresentation,
                title: "PPT 智能生成",
                desc: "一键将笔记内容转化为专业的演示文稿，高效完成知识展示。",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-background p-6 transition-all hover:border-foreground/20 hover:shadow-lg hover:shadow-neutral-100 dark:hover:shadow-neutral-900"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-foreground transition-colors group-hover:bg-neutral-900 group-hover:text-white dark:bg-neutral-800 dark:group-hover:bg-white dark:group-hover:text-neutral-900">
                  <Icon className="size-5" strokeWidth={1.5} />
                </div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-light tracking-tight text-foreground sm:text-4xl">
            开始构建你的知识体系
          </h2>
          <p className="mb-8 text-muted-foreground">
            无论是日常笔记、项目管理还是深度研究，MyNotes 都能成为你最得力的知识助手。
          </p>
          <Link
            href="/docs/projects"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-8 py-3.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-neutral-800 hover:shadow-xl dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            立即体验
            <IconArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border bg-neutral-50 px-6 py-8 dark:bg-neutral-900/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Image
              src="/logo.png"
              alt="My Notes"
              width={80}
              height={24}
              className="h-5 w-auto dark:invert"
            />
            <span className="text-xs">个人笔记与知识管理</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} MyNotes
          </p>
        </div>
      </footer>
    </div>
  )
}
