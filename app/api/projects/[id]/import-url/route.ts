import { NextRequest, NextResponse } from "next/server"
import { fileExists, writeFile } from "@/lib/storage"
import path from "path"
import { isValidProjectId, invalidProjectIdResponse } from "@/lib/validation"

/**
 * POST /api/projects/[id]/import-url
 * 从 URL 抓取文章内容并保存为 Markdown 文件到项目中
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!isValidProjectId(id)) {
    return invalidProjectIdResponse()
  }

  // 验证项目是否存在
  const projectExists = await fileExists(`projects/${id}/meta.json`)
  if (!projectExists) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 })
  }

  let body: { url: string; filename?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
  }

  const { url, filename: customFilename } = body

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "请提供有效的 URL" }, { status: 400 })
  }

  // 验证 URL 格式
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "仅支持 http/https 链接" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "URL 格式无效" }, { status: 400 })
  }

  try {
    // 抓取页面内容
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `抓取失败: HTTP ${response.status}` },
        { status: 422 }
      )
    }

    const contentType = response.headers.get("content-type") || ""
    const html = await response.text()

    // 从 HTML 中提取标题和正文内容
    const { title, markdown } = htmlToMarkdown(html, contentType, parsedUrl)

    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "未能从页面中提取到有效内容" },
        { status: 422 }
      )
    }

    // 确定文件名
    const docTitle = customFilename?.trim() || title || parsedUrl.hostname
    const safeFilename = docTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_").slice(0, 80)
    let finalFilename = `${safeFilename}.md`

    // 如果文件已存在，添加时间戳后缀
    const exists = await fileExists(`projects/${id}/${finalFilename}`)
    if (exists) {
      const ext = path.extname(finalFilename)
      const base = path.basename(finalFilename, ext)
      finalFilename = `${base}_${Date.now()}${ext}`
    }

    // 组装最终内容：标题 + 来源链接 + 正文
    const finalContent = `# ${docTitle}\n\n> 来源: ${url}\n\n${markdown}`

    // 写入文件
    await writeFile(`projects/${id}/${finalFilename}`, finalContent, {
      contentType: "text/markdown",
    })

    return NextResponse.json({
      success: true,
      filename: finalFilename,
      title: docTitle,
    })
  } catch (err) {
    console.error("Import URL error:", err)
    const message = err instanceof Error ? err.message : "抓取失败"
    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json({ error: "抓取超时，请检查链接是否可访问" }, { status: 422 })
    }
    return NextResponse.json({ error: `导入失败: ${message}` }, { status: 500 })
  }
}

// ─── HTML to Markdown 转换 ───

function htmlToMarkdown(
  html: string,
  contentType: string,
  baseUrl: URL
): { title: string; markdown: string } {
  // 如果返回的是纯文本
  if (contentType.includes("text/plain")) {
    return { title: "", markdown: html }
  }

  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].trim())
    : ""

  // 移除 script, style, nav, header, footer 等非内容标签
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")

  // 尝试提取 article 或 main 标签中的内容
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i)
  const contentMatch = cleaned.match(/<div[^>]*class="[^"]*(?:content|article|post|entry|markdown)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)

  const bodyContent = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || extractBody(cleaned)

  // 转换 HTML 标签为 Markdown
  let md = bodyContent

  // 处理标题 h1-h6
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n## ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n## ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n### ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, content) => `\n#### ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, content) => `\n##### ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, content) => `\n###### ${stripTags(content).trim()}\n\n`)

  // 处理代码块
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, content) => {
    return `\n\`\`\`\n${decodeHtmlEntities(stripTags(content)).trim()}\n\`\`\`\n\n`
  })
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, content) => {
    return `\n\`\`\`\n${decodeHtmlEntities(stripTags(content)).trim()}\n\`\`\`\n\n`
  })

  // 处理行内代码
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, content) => {
    return `\`${decodeHtmlEntities(stripTags(content))}\``
  })

  // 处理链接
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const linkText = stripTags(text).trim()
    if (!linkText) return ""
    let fullUrl = href
    try {
      fullUrl = new URL(href, baseUrl).href
    } catch { /* keep original */ }
    return `[${linkText}](${fullUrl})`
  })

  // 处理图片
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, (_, src, alt) => {
    let fullUrl = src
    try { fullUrl = new URL(src, baseUrl).href } catch { /* keep */ }
    return `![${alt}](${fullUrl})`
  })
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, (_, src) => {
    let fullUrl = src
    try { fullUrl = new URL(src, baseUrl).href } catch { /* keep */ }
    return `![](${fullUrl})`
  })

  // 处理加粗和斜体
  md = md.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, content) => `**${stripTags(content).trim()}**`)
  md = md.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, content) => `*${stripTags(content).trim()}*`)

  // 处理列表
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => `- ${stripTags(content).trim()}\n`)
  md = md.replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n")

  // 处理引用块
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = stripTags(content).trim().split("\n")
    return lines.map((l: string) => `> ${l.trim()}`).join("\n") + "\n\n"
  })

  // 处理段落和换行
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => `${stripTags(content).trim()}\n\n`)
  md = md.replace(/<br\s*\/?>/gi, "\n")
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n\n")

  // 处理表格（简单转换）
  md = md.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows: string[][] = []
    const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi) || []
    for (const row of rowMatches) {
      const cells = (row.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || [])
        .map((cell) => stripTags(cell.replace(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i, "$1")).trim())
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length === 0) return ""

    const maxCols = Math.max(...rows.map((r) => r.length))
    const normalized = rows.map((r) => {
      while (r.length < maxCols) r.push("")
      return r
    })

    let result = ""
    normalized.forEach((row, i) => {
      result += `| ${row.join(" | ")} |\n`
      if (i === 0) {
        result += `| ${row.map(() => "---").join(" | ")} |\n`
      }
    })
    return `\n${result}\n`
  })

  // 清理剩余的 HTML 标签
  md = stripTags(md)

  // 解码 HTML 实体
  md = decodeHtmlEntities(md)

  // 清理多余空行和空格
  md = md
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim()

  return { title, markdown: md }
}

function extractBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return bodyMatch?.[1] || html
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "")
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&bull;/g, "•")
    .replace(/&copy;/g, "©")
}
