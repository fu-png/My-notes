"use client"

import * as React from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import Typography from "@tiptap/extension-typography"
import Link from "@tiptap/extension-link"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Image from "@tiptap/extension-image"
import CodeBlock from "@tiptap/extension-code-block"
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconListCheck,
  IconQuote,
  IconSeparator,
  IconLink,
  IconPhoto,
  IconTable,
  IconCodeDots,
  IconHighlight,
  IconArrowBackUp,
  IconArrowForwardUp,
} from "@tabler/icons-react"

interface RichTextEditorProps {
  content: string
  onChange: (markdown: string) => void
  placeholder?: string
}

// ── Markdown serializer (HTML → Markdown) ──────────────────────────
function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return nodeToMarkdown(doc.body).trim()
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ""
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join("")

  switch (tag) {
    case "h1": return `# ${children}\n\n`
    case "h2": return `## ${children}\n\n`
    case "h3": return `### ${children}\n\n`
    case "h4": return `#### ${children}\n\n`
    case "h5": return `##### ${children}\n\n`
    case "h6": return `###### ${children}\n\n`
    case "p": return `${children}\n\n`
    case "br": return "\n"
    case "strong": case "b": return `**${children}**`
    case "em": case "i": return `*${children}*`
    case "s": case "del": return `~~${children}~~`
    case "code": return `\`${children}\``
    case "mark": return `==${children}==`
    case "a": {
      const href = el.getAttribute("href") || ""
      return `[${children}](${href})`
    }
    case "img": {
      const src = el.getAttribute("src") || ""
      const alt = el.getAttribute("alt") || ""
      return `![${alt}](${src})`
    }
    case "blockquote": return `> ${children.trim().split("\n").join("\n> ")}\n\n`
    case "pre": {
      const codeEl = el.querySelector("code")
      const code = codeEl ? codeEl.textContent || "" : children
      return `\`\`\`\n${code}\n\`\`\`\n\n`
    }
    case "ul": {
      // Check if it's a task list
      const items = Array.from(el.children)
      const isTaskList = items.some(li => li.hasAttribute("data-checked"))
      if (isTaskList) {
        return items.map(li => {
          const checked = li.getAttribute("data-checked") === "true"
          const content = Array.from(li.childNodes).map(nodeToMarkdown).join("").trim()
          return `- [${checked ? "x" : " "}] ${content}`
        }).join("\n") + "\n\n"
      }
      return items.map(li => {
        const content = Array.from(li.childNodes).map(nodeToMarkdown).join("").trim()
        return `- ${content}`
      }).join("\n") + "\n\n"
    }
    case "ol": {
      return Array.from(el.children).map((li, i) => {
        const content = Array.from(li.childNodes).map(nodeToMarkdown).join("").trim()
        return `${i + 1}. ${content}`
      }).join("\n") + "\n\n"
    }
    case "li": return children
    case "hr": return "---\n\n"
    case "table": {
      const rows = Array.from(el.querySelectorAll("tr"))
      if (rows.length === 0) return ""
      const result: string[] = []
      rows.forEach((row, i) => {
        const cells = Array.from(row.querySelectorAll("th, td"))
        const line = "| " + cells.map(c => (c.textContent || "").trim()).join(" | ") + " |"
        result.push(line)
        if (i === 0) {
          result.push("| " + cells.map(() => "---").join(" | ") + " |")
        }
      })
      return result.join("\n") + "\n\n"
    }
    case "tbody": case "thead": case "tr": case "th": case "td":
      return children
    default:
      return children
  }
}

// ── Markdown → HTML (simple parser for initial content) ────────────
function markdownToHtml(md: string): string {
  let html = md
  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`
  })
  // Headings
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>")
  // Task list items
  html = html.replace(/^- \[x\]\s+(.+)$/gm, '<li data-checked="true">$1</li>')
  html = html.replace(/^- \[ \]\s+(.+)$/gm, '<li data-checked="false">$1</li>')
  // Unordered list items
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>")
  // Ordered list items
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
  // Blockquote
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote><p>$1</p></blockquote>")
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>")
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
  // Highlight
  html = html.replace(/==(.+?)==/g, "<mark>$1</mark>")
  // Wrap loose lines in <p> tags (lines not already wrapped)
  html = html.replace(/^(?!<[hublop]|<li|<hr|<blockquote|<pre)(.+)$/gm, "<p>$1</p>")
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, (match) => {
    if (match.includes('data-checked')) {
      return `<ul data-type="taskList">${match}</ul>`
    }
    return `<ul>${match}</ul>`
  })
  return html
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// ── Toolbar button ─────────────────────────────────────────────────
function ToolbarButton({
  onClick,
  active,
  disabled,
  tooltip,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  tooltip: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`size-7 ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          onClick={onClick}
          disabled={disabled}
          type="button"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

// ── Main Component ─────────────────────────────────────────────────
export function RichTextEditor({ content, onChange, placeholder = "开始编辑..." }: RichTextEditorProps) {
  const initialContent = React.useRef(markdownToHtml(content))
  const isInternalUpdate = React.useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Use separate CodeBlock extension
      }),
      Placeholder.configure({
        placeholder,
      }),
      Highlight.configure({ multicolor: false }),
      Typography,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline underline-offset-4" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false }),
      CodeBlock.configure({
        HTMLAttributes: { class: "bg-muted/50 border p-4 font-mono text-sm" },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialContent.current,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[300px] px-6 py-8 outline-none focus:outline-none prose-headings:scroll-mt-20 prose-a:text-primary prose-a:underline-offset-4 prose-pre:bg-muted/50 prose-pre:border prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-img:border prose-table:text-sm prose-th:text-left prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground",
      },
    },
    onUpdate: ({ editor }) => {
      if (isInternalUpdate.current) return
      const html = editor.getHTML()
      const md = htmlToMarkdown(html)
      onChange(md)
    },
  })

  // Sync external content changes
  React.useEffect(() => {
    if (!editor) return
    const currentMd = htmlToMarkdown(editor.getHTML())
    if (currentMd.trim() !== content.trim()) {
      isInternalUpdate.current = true
      editor.commands.setContent(markdownToHtml(content))
      isInternalUpdate.current = false
    }
  }, [content, editor])

  if (!editor) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        编辑器加载中…
      </div>
    )
  }

  const addLink = () => {
    const url = window.prompt("输入链接 URL：")
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const addImage = () => {
    const url = window.prompt("输入图片 URL：")
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b px-3 py-1.5">
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          tooltip="加粗 (⌘B)"
        >
          <IconBold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          tooltip="斜体 (⌘I)"
        >
          <IconItalic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          tooltip="删除线 (⌘⇧X)"
        >
          <IconStrikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          tooltip="行内代码 (⌘E)"
        >
          <IconCode className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive("highlight")}
          tooltip="高亮"
        >
          <IconHighlight className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="!mx-1 !h-4" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          tooltip="标题 1"
        >
          <IconH1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          tooltip="标题 2"
        >
          <IconH2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          tooltip="标题 3"
        >
          <IconH3 className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="!mx-1 !h-4" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          tooltip="无序列表"
        >
          <IconList className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          tooltip="有序列表"
        >
          <IconListNumbers className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
          tooltip="任务列表"
        >
          <IconListCheck className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="!mx-1 !h-4" />

        {/* Blocks */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          tooltip="引用"
        >
          <IconQuote className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          tooltip="代码块"
        >
          <IconCodeDots className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          tooltip="分割线"
        >
          <IconSeparator className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="!mx-1 !h-4" />

        {/* Inserts */}
        <ToolbarButton onClick={addLink} active={editor.isActive("link")} tooltip="链接">
          <IconLink className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addImage} tooltip="图片">
          <IconPhoto className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addTable} tooltip="表格">
          <IconTable className="size-4" />
        </ToolbarButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          tooltip="撤销 (⌘Z)"
        >
          <IconArrowBackUp className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          tooltip="重做 (⌘⇧Z)"
        >
          <IconArrowForwardUp className="size-4" />
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
