"use client"

import Image from "next/image"
import Link from "next/link"
import { useRef, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  IconArrowRight,
  IconMessageChatbot,
  IconSearch,
  IconBook,
  IconFolderOpen,
  IconHeadphones,
  IconPresentation,
} from "@tabler/icons-react"

export default function Home() {
  const router = useRouter()
  const [noteInput, setNoteInput] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateNote = async () => {
    const name = noteInput.trim()
    if (!name || isCreating) return
    setIsCreating(true)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/docs/projects/${data.project.id}`)
      }
    } catch {
      setIsCreating(false)
    }
  }

  /* ── Video: fade in on load, loop via native attribute ── */
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onLoaded = () => {
      v.style.opacity = "1"
    }
    v.addEventListener("loadeddata", onLoaded)
    return () => v.removeEventListener("loadeddata", onLoaded)
  }, [])

  return (
    <div className="relative min-h-svh w-full bg-white dark:bg-neutral-950">
      {/* ══════════════════════ HERO SECTION ══════════════════════ */}
      <section className="relative min-h-svh w-full">
        {/* Video background layer */}
        <div className="pointer-events-none absolute inset-0 z-0" style={{ top: "300px" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            loop
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 0, transition: "opacity 0.8s ease-in" }}
          >
            <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4" type="video/mp4" />
          </video>
          {/* Gradient overlays */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-transparent to-white dark:from-neutral-950 dark:via-transparent dark:to-neutral-950" />
        </div>

        {/* Navigation */}
        <nav className="fixed left-0 right-0 top-0 z-50 border-b border-neutral-200/60 bg-white/80 px-8 py-4 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="MyNotes"
                width={120}
                height={36}
                className="h-7 w-auto dark:invert"
                priority
              />
            </div>
            {/* Menu — always visible */}
            <div className="flex items-center gap-8 text-sm">
              <Link href="/" className="font-medium text-black transition-colors dark:text-white">首页</Link>
              <Link href="/docs/projects" className="text-[#6F6F6F] transition-colors hover:text-black dark:hover:text-white">项目</Link>
              <a href="#features" className="text-[#6F6F6F] transition-colors hover:text-black dark:hover:text-white">特性</a>
            </div>
            {/* CTA */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/docs/projects"
                className="bg-black px-5 py-2 text-sm text-white transition-transform hover:scale-103 dark:bg-white dark:text-black"
              >
                开始使用
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 text-center">
          {/* Headline */}
          <h1
            className="max-w-7xl font-normal text-black dark:text-white"
            style={{
              fontFamily: "var(--font-serif), serif",
              fontSize: "clamp(3rem, 9vw, 7rem)",
              lineHeight: 1.0,
              letterSpacing: "-3px",
            }}
          >
            <span className="animate-fade-rise inline-block">
              记录每一刻
            </span>
            <br />
            <span className="animate-fade-rise inline-block" style={{ animationDelay: "0.12s" }}>
              <em className="text-[#999]" style={{ fontStyle: "italic" }}>思考</em>的轨迹
            </span>
          </h1>

          {/* Description */}
          <p className="mt-10 max-w-xl animate-fade-rise-delay text-base leading-relaxed text-[#888] dark:text-neutral-400 sm:text-lg">
            AI 驱动的个人笔记与知识管理平台
            <br className="hidden sm:block" />
            让灵感不再流失，让知识自然生长
          </p>

          {/* AI Input Box */}
          <div className="mt-14 w-full max-w-xl animate-fade-rise-delay-2">
            <div className="flex items-center gap-2 border border-neutral-200 bg-white px-4 py-3 shadow-lg transition-all focus-within:border-neutral-400 focus-within:shadow-xl dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-neutral-500">
              <IconMessageChatbot className="size-5 shrink-0 text-neutral-400" strokeWidth={1.5} />
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleCreateNote()
                  }
                }}
                placeholder="输入笔记标题，按 Enter 创建..."
                className="flex-1 bg-transparent text-sm text-black outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-neutral-500"
                disabled={isCreating}
              />
              <button
                onClick={handleCreateNote}
                disabled={!noteInput.trim() || isCreating}
                className="flex size-8 shrink-0 items-center justify-center bg-black text-white transition-all hover:bg-neutral-800 disabled:opacity-30 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                <IconArrowRight className="size-4" />
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-neutral-400">
              输入笔记标题，即刻开始记录你的想法
            </p>
          </div>
        </div>
      </section>

      {/* ─── Trusted By Brand Logos ─── */}
      <section className="border-y border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8 md:flex-nowrap md:justify-between">
            {[
              { name: "Vercel", svg: <svg viewBox="0 0 24 24" className="h-5 w-auto fill-current"><path d="M12 4l8 14H4z" /></svg> },
              { name: "OpenAI", svg: <svg viewBox="0 0 24 24" className="h-5 w-auto fill-current"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v3l-2.597 1.5-2.607-1.5z" /></svg> },
              { name: "GitHub", svg: <svg viewBox="0 0 24 24" className="h-6 w-auto fill-current"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg> },
              { name: "Notion", svg: <svg viewBox="0 0 24 24" className="h-5 w-auto fill-current"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19v-7.187c0-.654-.28-1.68-1.214-1.68l-1.078-.047c-.093 0-.187-.14-.093-.373l.7-1.588c.14-.327.28-.42.654-.467l4.434-.28c.093 0 .187.093.14.187l-4.762 7.466v-5.44l-1.214.093c-.093 0-.187-.14-.093-.42l.7-1.588c.14-.327.28-.42.654-.467z" /></svg> },
              { name: "Linear", svg: <svg viewBox="0 0 24 24" className="h-5 w-auto fill-current"><path d="M3.156 9.064L14.936 20.844L9.064 20.844L3.156 14.936L3.156 9.064ZM2.812 5.226L18.774 21.188L16.95 21.188L2.812 7.05L2.812 5.226ZM2.812 1.388L22.612 21.188L20.788 21.188L2.812 3.212L2.812 1.388Z" /></svg> },
              { name: "Figma", svg: <svg viewBox="0 0 24 24" className="h-5 w-auto fill-current"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.473H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.473H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.49c0 2.476-2.014 4.49-4.49 4.49zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.665 0 3.019-1.355 3.019-3.019v-3.019h-3.044zm7.587.621c-.169 0-.337-.012-.503-.036-.066-.01-.132-.021-.198-.033a3.012 3.012 0 0 1-2.504-2.504 3.034 3.034 0 0 1-.036-.503c0-.169.012-.337.036-.503.01-.066.021-.132.033-.198a3.012 3.012 0 0 1 2.504-2.504c.166-.024.334-.036.503-.036.169 0 .337.012.503.036.066.01.132.021.198.033a3.012 3.012 0 0 1 2.504 2.504c.024.166.036.334.036.503 0 .169-.012.337-.036.503-.01.066-.021.132-.033.198a3.012 3.012 0 0 1-2.504 2.504c-.166.024-.334.036-.503.036zm0-4.529c-.835 0-1.512.677-1.512 1.512s.677 1.512 1.512 1.512 1.512-.677 1.512-1.512-.677-1.512-1.512-1.512z" /></svg> },
              { name: "Stripe", svg: <svg viewBox="0 0 24 24" className="h-5 w-auto fill-current"><path d="M13.479 9.883c-1.626-.604-2.512-1.067-2.512-1.803 0-.622.511-.977 1.423-.977 1.667 0 3.379.642 4.558 1.22l.666-4.111c-.935-.446-2.847-1.177-5.49-1.177-1.87 0-3.425.489-4.536 1.401-1.155.952-1.757 2.324-1.757 3.974 0 2.989 1.825 4.267 4.806 5.345 1.917.677 2.559 1.165 2.559 1.917 0 .73-.629 1.158-1.762 1.158-1.443 0-3.823-.708-5.387-1.625l-.674 4.16c1.339.756 3.821 1.531 6.391 1.531 1.975 0 3.622-.471 4.736-1.375 1.244-.998 1.889-2.492 1.889-4.328 0-3.063-1.872-4.337-4.91-5.41z" /></svg> },
            ].map(({ name, svg }) => (
              <div
                key={name}
                className="flex shrink-0 items-center gap-2 text-black opacity-40 transition-all hover:opacity-100 dark:text-white"
              >
                {svg}
                <span className="text-base font-semibold tracking-tight">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Product Preview ─── */}
      <section className="bg-neutral-50 px-6 py-20 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl">
          <div className="border border-neutral-200 bg-white shadow-2xl shadow-neutral-300/40 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-neutral-900/60">
            <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
              <div className="flex gap-1.5">
                <div className="size-3 rounded-full bg-[#FF5F57]" />
                <div className="size-3 rounded-full bg-[#FEBC2E]" />
                <div className="size-3 rounded-full bg-[#28C840]" />
              </div>
              <div className="mx-auto text-xs text-neutral-400 dark:text-neutral-500">
                mynotes.app
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/product-preview.png"
              alt="MyNotes — AI 驱动的个人笔记与知识管理平台"
              style={{ display: "block", width: "100%", height: "auto", maxWidth: "2430px", objectFit: "contain" }}
            />
          </div>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section className="px-6 py-16">
        <Separator className="mb-16" />
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { value: "10,000+", label: "用户笔记" },
            { value: "500+", label: "AI 对话/天" },
            { value: "98%", label: "检索准确率" },
            { value: "24/7", label: "随时可用" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p
                className="mb-1 text-4xl font-normal text-black dark:text-white md:text-5xl"
                style={{ fontFamily: "var(--font-serif), serif" }}
              >
                {value}
              </p>
              <p className="text-sm text-neutral-400">{label}</p>
            </div>
          ))}
        </div>
        <Separator className="mt-16" />
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="mb-4">核心功能</Badge>
            <h2
              className="mb-4 text-4xl font-normal tracking-tight text-black dark:text-white sm:text-5xl"
              style={{ fontFamily: "var(--font-serif), serif" }}
            >
              <em className="text-[#999]" style={{ fontStyle: "italic" }}>一站式</em>知识管理
            </h2>
            <p className="mx-auto max-w-2xl text-base text-neutral-500 dark:text-neutral-400">
              从灵感记录到知识检索，从阅读批注到内容输出，MyNotes 覆盖知识管理的每一个环节。
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: IconMessageChatbot, title: "AI 智能对话", desc: "基于上下文的 AI 对话，帮助你深入思考、整理灵感，让笔记更有深度。" },
              { icon: IconSearch, title: "RAG 知识检索", desc: "结合向量搜索和 BM25 的混合检索引擎，在海量笔记中精准定位所需内容。" },
              { icon: IconBook, title: "沉浸阅读模式", desc: "专为长文阅读设计的沉浸式排版，让你专注于知识的消化吸收。" },
              { icon: IconFolderOpen, title: "项目化管理", desc: "用项目组织你的笔记和文件，清晰的层级结构让知识管理更有条理。" },
              { icon: IconHeadphones, title: "音频内容生成", desc: "将笔记转化为音频内容，支持多种场景的知识输出和分享。" },
              { icon: IconPresentation, title: "PPT 智能生成", desc: "一键将笔记内容转化为专业的演示文稿，高效完成知识展示。" },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="group transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <CardHeader>
                  <div className="mb-2 flex size-11 items-center justify-center bg-neutral-100 text-black transition-all group-hover:bg-black group-hover:text-white dark:bg-neutral-800 dark:text-white dark:group-hover:bg-white dark:group-hover:text-black">
                    <Icon className="size-5" strokeWidth={1.5} />
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="px-6 py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className="mb-6 text-5xl font-normal tracking-tight text-black dark:text-white sm:text-6xl"
            style={{ fontFamily: "var(--font-serif), serif", lineHeight: 1.05 }}
          >
            <em className="text-[#999]" style={{ fontStyle: "italic" }}>现在</em>就开始
          </h2>
          <p className="mb-10 text-base text-neutral-500 dark:text-neutral-400">
            无论是日常笔记、项目管理还是深度研究，MyNotes 都能成为你最得力的知识助手。
          </p>
          <Link
            href="/docs/projects"
            className="inline-flex items-center gap-2 bg-black px-12 py-4 text-base text-white transition-transform hover:scale-103 dark:bg-white dark:text-black"
          >
            免费开始使用
            <IconArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-6 py-12">
        <Separator className="mb-12" />
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="My Notes"
                width={100}
                height={30}
                className="h-6 w-auto dark:invert"
              />
              <span className="text-xs text-neutral-400">个人笔记与知识管理</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-neutral-400">
              <Link href="/docs/projects" className="transition-colors hover:text-black dark:hover:text-white">项目</Link>
              <a href="#features" className="transition-colors hover:text-black dark:hover:text-white">特性</a>
            </div>
            <p className="text-xs text-neutral-400">
              &copy; {new Date().getFullYear()} MyNotes
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
