import Link from "next/link"
import { docSections } from "@/lib/docs"
import {
  IconBook,
  IconBrain,
  IconTool,
  IconRocket,
  IconFileText,
  IconNotebook,
  IconArrowRight,
} from "@tabler/icons-react"

const sectionIcons: Record<string, React.ReactNode> = {
  "开始阅读": <IconNotebook className="size-5" />,
  "Part 1. 基础篇 — 建立心智模型": <IconBook className="size-5" />,
  "Part 2. 核心系统篇 — 深入子系统": <IconBrain className="size-5" />,
  "Part 3. 高级模式篇 — Agent 的组合与扩展": <IconTool className="size-5" />,
  "Part 4. 工程实践篇 — 从原理到构建": <IconRocket className="size-5" />,
  "附录 — 参考资料速查": <IconFileText className="size-5" />,
}

export default function DocsHomePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:px-8 lg:px-10">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight">
          My Notes
        </h1>
        <p className="text-lg text-muted-foreground">
          Claude Code 架构深度剖析
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          15 章 + 4 篇附录 · 42 万字 · 139 张架构图
        </p>
      </div>

      {/* Quick start */}
      <div className="mb-12 rounded-lg border bg-muted/30 p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          阅读建议
        </h2>
        <div className="space-y-2 text-sm leading-relaxed">
          <p>
            <strong>时间紧张？</strong> 01 → 02 → 04 → 15，拿到核心认知和动手能力
          </p>
          <p>
            <strong>有经验？</strong> 直接读 Part 2 + Part 3，遇到概念缺口回溯 Part 1
          </p>
          <p>
            <strong>系统学习？</strong> 从头到尾，每章做练习，最后 Ch15
            构建自己的 Harness（约 2–3 周）
          </p>
        </div>
      </div>

      {/* Table of contents */}
      <div className="space-y-8">
        {docSections.map((section) => (
          <div key={section.title}>
            <div className="mb-3 flex items-center gap-2 text-muted-foreground">
              {sectionIcons[section.title]}
              <h2 className="text-base font-semibold text-foreground">
                {section.title}
              </h2>
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  className="group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <span>{item.title}</span>
                  <IconArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t pt-6 text-center text-xs text-muted-foreground">
        <p>
          内容来源于{" "}
          <a
            href="https://github.com/lintsinghua/claude-code-book"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            claude-code-book
          </a>
          ，采用 CC BY-NC-SA 4.0 协议。
        </p>
      </footer>
    </div>
  )
}
