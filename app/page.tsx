"use client"

import Image from "next/image"
import Link from "next/link"
import { useRef } from "react"
import { useTheme } from "next-themes"
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useSpring,
} from "motion/react"
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
  IconBrain,
  IconRocket,
  IconShieldCheck,
} from "@tabler/icons-react"

/* ───────────────────────── Animated Section Wrapper ───────────────────────── */
function FadeInSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ───────────────────────── Logo SVG Components ───────────────────────── */
function LogoOpenAI({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  )
}

function LogoVercel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L24 22H0L12 1z" />
    </svg>
  )
}

function LogoNotion({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.29 2.133c-.42-.326-.98-.7-2.055-.607L3.01 2.596c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.934-.56.934-1.166V6.354c0-.606-.234-.933-.747-.886l-15.177.886c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.934-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.187c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.513.28-.886.747-.932zM1.936 1.035l13.31-1.72C17.175-.833 18.15.093 18.803.56l3.829 2.333c.841.606.607.887.607 1.586v15.545c0 .746-.28 1.4-1.262 1.493L6.402 22.5c-.747.047-1.12-.093-1.541-.606L1.307 17.2c-.42-.56-.607-1.073-.607-1.68V2.835c0-.747.28-1.353 1.236-1.8z" />
    </svg>
  )
}

function LogoSlack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  )
}

function LogoGithub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

/* ───────────────────────── Main Page ───────────────────────── */
export default function Home() {
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })

  // Parallax: background moves slower than scroll
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"])
  // Smooth spring for parallax
  const smoothBgY = useSpring(bgY, { stiffness: 100, damping: 30 })
  // Fade out hero content on scroll
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95])

  return (
    <div className="relative min-h-svh bg-white dark:bg-neutral-950">
      {/* ─── Navigation ─── */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-white/70 backdrop-blur-xl dark:bg-neutral-950/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="My Notes"
              width={120}
              height={36}
              className="h-7 w-auto dark:invert"
              priority
            />
          </Link>
          <div className="hidden items-center gap-8 text-sm text-neutral-500 md:flex">
            <a href="#features" className="transition-colors hover:text-neutral-900 dark:hover:text-white">
              Features
            </a>
            <a href="#preview" className="transition-colors hover:text-neutral-900 dark:hover:text-white">
              Preview
            </a>
            <Link href="/docs/dashboard" className="transition-colors hover:text-neutral-900 dark:hover:text-white">
              Docs
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/docs/projects"
              className="hidden rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-all hover:scale-105 hover:bg-neutral-800 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 sm:inline-flex"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section
        ref={heroRef}
        className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden"
      >
        {/* Parallax background image — NO white overlay */}
        <motion.div className="absolute inset-0 z-0" style={{ y: smoothBgY }}>
          <Image
            src="/hero-bg.png"
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          {/* Only a subtle bottom gradient to blend into next section */}
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-white via-white/60 to-transparent dark:from-neutral-950 dark:via-neutral-950/60" />
        </motion.div>

        {/* Hero content */}
        <motion.div
          className="relative z-10 flex flex-col items-center px-6 text-center"
          style={{ opacity: heroOpacity, scale: heroScale }}
        >
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md"
          >
            <IconSparkles className="size-4" />
            AI-Powered Knowledge Platform
          </motion.div>

          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mb-6 max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight text-white drop-shadow-lg sm:text-6xl md:text-7xl lg:text-8xl"
          >
            Think Deeper.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Know More.
            </span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mb-10 max-w-xl text-base leading-relaxed text-white/80 drop-shadow-sm sm:text-lg"
          >
            MyNotes 集成 AI 对话、RAG 检索、沉浸阅读、智能生成，
            <br className="hidden sm:block" />
            重新定义个人知识管理。
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex items-center gap-4"
          >
            <Link
              href="/docs/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-neutral-900 shadow-xl shadow-black/20 transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
            >
              Start for Free
              <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#preview"
              className="rounded-full border border-white/30 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/20 hover:scale-105 active:scale-95"
            >
              See it in Action
            </a>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-xs font-medium tracking-widest text-white/60 uppercase">
              Scroll
            </span>
            <div className="h-8 w-5 rounded-full border-2 border-white/40 p-1">
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="h-1.5 w-1.5 rounded-full bg-white/80"
              />
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Trusted By / Logo Bar ─── */}
      <section className="border-b border-neutral-100 bg-white py-10 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto max-w-5xl px-6">
          <FadeInSection>
            <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Built with industry-leading technologies
            </p>
            <div className="flex items-center justify-center gap-10 sm:gap-14 md:gap-20">
              {[
                { Icon: LogoOpenAI, label: "OpenAI" },
                { Icon: LogoVercel, label: "Vercel" },
                { Icon: LogoNotion, label: "Notion" },
                { Icon: LogoSlack, label: "Slack" },
                { Icon: LogoGithub, label: "GitHub" },
              ].map(({ Icon, label }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="flex flex-col items-center gap-2 text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-white"
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[11px] font-semibold tracking-wide">{label}</span>
                </motion.div>
              ))}
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* ─── Product Preview ─── */}
      <section id="preview" className="relative overflow-hidden bg-neutral-50 px-6 py-24 dark:bg-neutral-900/50">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[600px] w-[800px] rounded-full bg-gradient-to-r from-emerald-200/30 via-cyan-200/20 to-blue-200/30 blur-3xl dark:from-emerald-900/20 dark:via-cyan-900/15 dark:to-blue-900/20" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <FadeInSection>
            <p className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
              Product Preview
            </p>
            <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl md:text-5xl">
              Your Knowledge, Beautifully Organized
            </h2>
            <p className="mx-auto mb-14 max-w-2xl text-center text-neutral-500 dark:text-neutral-400">
              左侧文件树管理笔记，中间沉浸式阅读，右侧 AI 助手随时对话，一个界面掌控所有知识。
            </p>
          </FadeInSection>

          {/* Browser mockup */}
          <FadeInSection delay={0.2}>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_20px_70px_-15px_rgba(0,0,0,0.15)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[0_20px_70px_-15px_rgba(0,0,0,0.5)]"
            >
              {/* macOS title bar */}
              <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-[#FF5F57]" />
                  <div className="size-3 rounded-full bg-[#FEBC2E]" />
                  <div className="size-3 rounded-full bg-[#28C840]" />
                </div>
                <div className="ml-4 flex-1 rounded-md bg-neutral-100 px-4 py-1 text-center text-xs text-neutral-400 dark:bg-neutral-800">
                  my-notes.app
                </div>
              </div>
              {/* Screenshot */}
              <div className="relative aspect-[16/9.5] w-full">
                <Image
                  src="/product-preview.png"
                  alt="MyNotes Product Preview"
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 1200px) 100vw, 1200px"
                />
              </div>
            </motion.div>
          </FadeInSection>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <FadeInSection>
            <p className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
              Core Features
            </p>
            <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl md:text-5xl">
              Everything You Need to
              <br />
              <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">
                Master Your Knowledge
              </span>
            </h2>
            <p className="mx-auto mb-16 max-w-2xl text-center text-neutral-500 dark:text-neutral-400">
              集成七大核心能力，从笔记创作到知识输出，全面覆盖你的知识管理工作流。
            </p>
          </FadeInSection>

          {/* Feature cards */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: IconMessageChatbot,
                title: "AI 智能对话",
                desc: "基于上下文的多轮 AI 对话，深入分析笔记内容，激发灵感与洞见。",
                gradient: "from-violet-500 to-purple-600",
              },
              {
                icon: IconSearch,
                title: "RAG 知识检索",
                desc: "向量搜索 + BM25 混合引擎，在海量笔记中毫秒级精准定位。",
                gradient: "from-blue-500 to-cyan-500",
              },
              {
                icon: IconBook,
                title: "沉浸阅读模式",
                desc: "极致排版体验，目录导航、精读模式、翻译一键切换。",
                gradient: "from-emerald-500 to-teal-500",
              },
              {
                icon: IconFolderOpen,
                title: "项目化管理",
                desc: "文件树 + 标签系统，清晰的层级结构让知识井然有序。",
                gradient: "from-amber-500 to-orange-500",
              },
              {
                icon: IconHeadphones,
                title: "音频内容生成",
                desc: "笔记一键转 Podcast 风格音频，通勤路上也能高效学习。",
                gradient: "from-pink-500 to-rose-500",
              },
              {
                icon: IconPresentation,
                title: "PPT 智能生成",
                desc: "AI 分析内容结构，自动生成专业演示文稿，汇报不再加班。",
                gradient: "from-indigo-500 to-violet-500",
              },
            ].map(({ icon: Icon, title, desc, gradient }, i) => (
              <FadeInSection key={title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -6, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-7 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  {/* Hover glow */}
                  <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20`} />

                  <div className={`mb-5 inline-flex items-center justify-center rounded-xl bg-gradient-to-br ${gradient} p-3 text-white shadow-lg`}>
                    <Icon className="size-5" strokeWidth={2} />
                  </div>
                  <h3 className="mb-2 text-base font-bold text-neutral-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {desc}
                  </p>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why MyNotes ─── */}
      <section className="bg-neutral-50 px-6 py-24 dark:bg-neutral-900/50">
        <div className="mx-auto max-w-5xl">
          <FadeInSection>
            <h2 className="mb-16 text-center text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
              Why MyNotes?
            </h2>
          </FadeInSection>

          <div className="grid gap-12 sm:grid-cols-3">
            {[
              {
                icon: IconBrain,
                title: "AI-Native",
                desc: "从底层为 AI 设计，不是简单的 ChatBot 嵌入，而是深度融合每一个工作流。",
              },
              {
                icon: IconRocket,
                title: "Lightning Fast",
                desc: "基于 Next.js 构建，毫秒级页面加载，离线缓存，随时随地流畅使用。",
              },
              {
                icon: IconShieldCheck,
                title: "Privacy First",
                desc: "数据完全由你掌控，本地优先存储，端到端加密，你的知识只属于你。",
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <FadeInSection key={title} delay={i * 0.15}>
                <div className="text-center">
                  <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                    <Icon className="size-6" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-3 text-lg font-bold text-neutral-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {desc}
                  </p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="relative overflow-hidden px-6 py-32">
        {/* Background gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/20" />
          <div className="absolute right-1/4 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-900/20" />
        </div>

        <FadeInSection>
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="mb-6 text-4xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-5xl">
              Ready to Transform
              <br />
              Your Knowledge Workflow?
            </h2>
            <p className="mb-10 text-lg text-neutral-500 dark:text-neutral-400">
              加入数百位知识工作者，开始用 AI 重新定义你的笔记体验。
            </p>
            <Link
              href="/docs/projects"
              className="group inline-flex items-center gap-2 rounded-full bg-neutral-900 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-neutral-900/20 transition-all hover:scale-105 hover:shadow-2xl active:scale-95 dark:bg-white dark:text-neutral-900 dark:shadow-white/10"
            >
              Get Started — It&apos;s Free
              <IconArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </FadeInSection>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-neutral-100 px-6 py-8 dark:border-neutral-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="My Notes"
              width={80}
              height={24}
              className="h-5 w-auto dark:invert"
            />
            <span className="text-xs text-neutral-400">
              AI-Powered Knowledge Platform
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            &copy; {new Date().getFullYear()} MyNotes. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
