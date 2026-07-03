"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import rehypeSlug from "rehype-slug"
import { IconCopy, IconCheck } from "@tabler/icons-react"

interface MarkdownRendererProps {
  content: string
}

// ── Mermaid renderer ────────────────────────────────────────────────
function MermaidBlock({ code }: { code: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [svg, setSvg] = React.useState<string>("")
  const [error, setError] = React.useState<string>("")

  // Detect dark mode from the <html> class (set by next-themes)
  // 使用 useSyncExternalStore 订阅 dark class 变化，避免 set-state-in-effect
  const isDark = React.useSyncExternalStore(
    (callback: () => void) => {
      const html = document.documentElement
      const observer = new MutationObserver(callback)
      observer.observe(html, { attributes: true, attributeFilter: ["class"] })
      return () => observer.disconnect()
    },
    () => document.documentElement.classList.contains("dark"),
    () => false
  )

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "base",
          securityLevel: "strict",
          fontFamily: "inherit",
          themeVariables: isDark
            ? {
                primaryColor: "#374151",
                primaryTextColor: "#f3f4f6",
                primaryBorderColor: "#6b7280",
                secondaryColor: "#4b5563",
                secondaryTextColor: "#e5e7eb",
                secondaryBorderColor: "#9ca3af",
                tertiaryColor: "#1f2937",
                tertiaryTextColor: "#d1d5db",
                tertiaryBorderColor: "#6b7280",
                lineColor: "#9ca3af",
                textColor: "#e5e7eb",
                mainBkg: "#374151",
                nodeBorder: "#6b7280",
                clusterBkg: "#111827",
                clusterBorder: "#4b5563",
                titleColor: "#f3f4f6",
                edgeLabelBackground: "#1f2937",
                nodeTextColor: "#f3f4f6",
              }
            : {
                primaryColor: "#f3f4f6",
                primaryTextColor: "#111827",
                primaryBorderColor: "#374151",
                secondaryColor: "#e5e7eb",
                secondaryTextColor: "#1f2937",
                secondaryBorderColor: "#6b7280",
                tertiaryColor: "#d1d5db",
                tertiaryTextColor: "#111827",
                tertiaryBorderColor: "#9ca3af",
                lineColor: "#374151",
                textColor: "#111827",
                mainBkg: "#f3f4f6",
                nodeBorder: "#374151",
                clusterBkg: "#ffffff",
                clusterBorder: "#d1d5db",
                titleColor: "#111827",
                edgeLabelBackground: "#ffffff",
                nodeTextColor: "#111827",
              },
        })
        // Strip inline classDef / style assignment / class assignment lines
        // so the global theme controls all colors.
        // We only strip "class X,Y,Z className" (style assignment) not "class Foo {" (classDiagram definition)
        const cleaned = code
          .split("\n")
          .filter((l) => {
            if (/^\s*classDef\s/.test(l)) return false
            if (/^\s*style\s+\S+\s/.test(l)) return false
            // "class X,Y nodeClass" — style assignment (has comma-separated IDs followed by a class name)
            if (/^\s*class\s+[\w,]+\s+\w+\s*$/.test(l)) return false
            return true
          })
          .join("\n")
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
        const { svg: rendered } = await mermaid.render(id, cleaned)
        if (!cancelled) setSvg(rendered)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code, isDark])

  if (error) {
    return (
      <div className="my-4 overflow-x-auto rounded-md border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-amber-500" />
          <span>图表语法暂不支持渲染</span>
        </div>
        <pre className="text-xs text-muted-foreground"><code>{code}</code></pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center rounded-md border bg-muted/20 p-8 text-sm text-muted-foreground">
        图表渲染中…
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto rounded-md border bg-background p-4 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '') }}
    />
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
      title="复制代码"
      aria-label={copied ? "已复制" : "复制代码"}
    >
      {copied ? (
        <>
          <IconCheck className="size-3.5" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <IconCopy className="size-3.5" />
          <span>复制</span>
        </>
      )}
    </button>
  )
}

function HeadingWithId({
  level,
  children,
  id,
}: { level: number; children?: React.ReactNode; id?: string }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  return (
    <Tag id={id}>
      {children}
    </Tag>
  )
}

// ── Static plugin arrays (stable references, never recreated) ──────
const remarkPlugins = [remarkGfm]
// Custom sanitize schema: allow safe HTML subset but block scripts/event handlers
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "sup", "sub", "mark", "abbr", "details", "summary",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "id", "style"],
    img: [...(defaultSchema.attributes?.["img"] || []), "loading", "decoding"],
  },
}

// rehype 插件列表（类型由 react-markdown 的 rehypePlugins prop 推断）
const rehypePlugins = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeSlug,
] as React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]

// ── Static components map (stable reference) ──────────────────────
const markdownComponents = {
  pre({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
    // Extract text content from the code block for copying
    const codeElement = React.Children.toArray(children).find(
      (child): child is React.ReactElement =>
        React.isValidElement(child) && child.type === "code"
    )
    const codeProps = codeElement?.props as
      | Record<string, unknown>
      | undefined
    const codeText = codeProps?.children
      ? String(codeProps.children).replace(/\n$/, "")
      : ""

    // Detect mermaid code blocks and render them as diagrams
    const className = String(codeProps?.className ?? "")
    if (className.includes("language-mermaid") && codeText) {
      return <MermaidBlock code={codeText} />
    }

    return (
      <pre className="group relative" {...props}>
        {children}
        {codeText && <CopyButton text={codeText} />}
      </pre>
    )
  },
  h1({ children, id }: { children?: React.ReactNode; id?: string }) {
    return <HeadingWithId level={1} id={id}>{children}</HeadingWithId>
  },
  h2({ children, id }: { children?: React.ReactNode; id?: string }) {
    return <HeadingWithId level={2} id={id}>{children}</HeadingWithId>
  },
  h3({ children, id }: { children?: React.ReactNode; id?: string }) {
    return <HeadingWithId level={3} id={id}>{children}</HeadingWithId>
  },
  h4({ children, id }: { children?: React.ReactNode; id?: string }) {
    return <HeadingWithId level={4} id={id}>{children}</HeadingWithId>
  },
}

// ── Memoized MarkdownRenderer ─────────────────────────────────────
export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary prose-a:underline-offset-4 prose-pre:bg-muted prose-pre:border prose-pre:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-img:rounded-lg prose-img:border prose-table:text-sm prose-th:text-left prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
})
