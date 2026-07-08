/**
 * POST /projects/:id/import-url
 * 从 URL 抓取文章内容并保存为 Markdown 文件到项目中
 */

import path from "path"
import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { fileExists, writeFile } from "../../lib/storage.js"
import { isValidProjectId, isSafeExternalUrl } from "../../lib/validation.js"

interface ImportUrlBody {
  url?: string
  filename?: string
}

export default async function importUrlRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: ImportUrlBody }>(
    "/projects/:id/import-url",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, id)
      if (!project) return

      const { url, filename: customFilename } = request.body

      if (!url || typeof url !== "string") {
        return reply.code(400).send({ error: "请提供有效的 URL" })
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return reply.code(400).send({ error: "仅支持 http/https 链接" })
        }
        if (!isSafeExternalUrl(url)) {
          return reply.code(400).send({ error: "不允许访问内部网络地址" })
        }
      } catch {
        return reply.code(400).send({ error: "URL 格式无效" })
      }

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        })

        if (!response.ok) {
          return reply.code(422).send({ error: `抓取失败: HTTP ${response.status}` })
        }

        const contentLength = parseInt(response.headers.get("content-length") || "0", 10)
        if (contentLength > 5 * 1024 * 1024) {
          return reply.code(400).send({ error: "页面内容过大（超过 5MB）" })
        }

        const contentType = response.headers.get("content-type") || ""
        const html = await response.text()

        const { title, markdown } = htmlToMarkdown(html, contentType, parsedUrl)

        if (!markdown.trim()) {
          return reply.code(422).send({ error: "未能从页面中提取到有效内容" })
        }

        const docTitle = customFilename?.trim() || title || parsedUrl.hostname
        const safeFilename = docTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_").slice(0, 80)
        let finalFilename = `${safeFilename}.md`

        const projectPrefix = `users/${userId}/projects/${id}/`
        const exists = await fileExists(`${projectPrefix}${finalFilename}`)
        if (exists) {
          const ext = path.extname(finalFilename)
          const base = path.basename(finalFilename, ext)
          finalFilename = `${base}_${Date.now()}${ext}`
        }

        const finalContent = `# ${docTitle}\n\n> 来源: ${url}\n\n${markdown}`

        await writeFile(`${projectPrefix}${finalFilename}`, finalContent, {
          contentType: "text/markdown",
        })

        return { success: true, filename: finalFilename, title: docTitle }
      } catch (err) {
        fastify.log.error(err, "Import URL error")
        const message = err instanceof Error ? err.message : "抓取失败"
        if (message.includes("timeout") || message.includes("abort")) {
          return reply.code(422).send({ error: "抓取超时，请检查链接是否可访问" })
        }
        return reply.code(500).send({ error: `导入失败: ${message}` })
      }
    }
  )
}

// ─── HTML to Markdown 转换 ───

function htmlToMarkdown(
  html: string,
  contentType: string,
  baseUrl: URL
): { title: string; markdown: string } {
  if (contentType.includes("text/plain")) {
    return { title: "", markdown: html }
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : ""

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")

  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i)
  const contentMatch = cleaned.match(
    /<div[^>]*class="[^"]*(?:content|article|post|entry|markdown)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  )

  const bodyContent = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || extractBody(cleaned)

  let md = bodyContent

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n## ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n## ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n### ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, content) => `\n#### ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, content) => `\n##### ${stripTags(content).trim()}\n\n`)
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, content) => `\n###### ${stripTags(content).trim()}\n\n`)

  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, content) => {
    return `\n\`\`\`\n${decodeHtmlEntities(stripTags(content)).trim()}\n\`\`\`\n\n`
  })
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, content) => {
    return `\n\`\`\`\n${decodeHtmlEntities(stripTags(content)).trim()}\n\`\`\`\n\n`
  })

  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, content) => {
    return `\`${decodeHtmlEntities(stripTags(content))}\``
  })

  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const linkText = stripTags(text).trim()
    if (!linkText) return ""
    let fullUrl = href
    try {
      fullUrl = new URL(href, baseUrl).href
    } catch {
      /* keep original */
    }
    return `[${linkText}](${fullUrl})`
  })

  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, (_, src, alt) => {
    let fullUrl = src
    try {
      fullUrl = new URL(src, baseUrl).href
    } catch {
      /* keep */
    }
    return `![${alt}](${fullUrl})`
  })
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, (_, src) => {
    let fullUrl = src
    try {
      fullUrl = new URL(src, baseUrl).href
    } catch {
      /* keep */
    }
    return `![](${fullUrl})`
  })

  md = md.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, content) => `**${stripTags(content).trim()}**`)
  md = md.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, content) => `*${stripTags(content).trim()}*`)

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => `- ${stripTags(content).trim()}\n`)
  md = md.replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n")

  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = stripTags(content).trim().split("\n")
    return lines.map((l: string) => `> ${l.trim()}`).join("\n") + "\n\n"
  })

  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => `${stripTags(content).trim()}\n\n`)
  md = md.replace(/<br\s*\/?>/gi, "\n")
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n\n")

  md = md.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows: string[][] = []
    const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi) || []
    for (const row of rowMatches) {
      const cells = (row.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || []).map((cell) =>
        stripTags(cell.replace(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i, "$1")).trim()
      )
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

  md = stripTags(md)
  md = decodeHtmlEntities(md)

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
