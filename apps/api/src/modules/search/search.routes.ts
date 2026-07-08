import type { FastifyInstance } from "fastify"
import { getAuthContext } from "../../lib/auth-context.js"
import { getProjects, listFiles } from "../../lib/storage.js"
import { userProjectPrefix } from "../../lib/storage.js"
import { searchByBm25 } from "../../lib/rag/bm25-store.js"
import { getIndexStatus } from "../../lib/rag/pipeline.js"

/**
 * 跨项目搜索 API
 *
 * GET /search?q=keyword&mode=all|title|content — 跨项目搜索
 *
 * 迁移自 apps/web/app/api/search/route.ts。
 * 存储路径从 `projects/{projectId}/` 改为 `users/{userId}/projects/{projectId}/`。
 * 现在必须鉴权（需要 userId 来查询用户自己的项目）。
 * 保留原有的 IP 限流逻辑、标题匹配 + BM25 内容匹配两阶段搜索、snippet 提取。
 */

// ─── 内容搜索结果类型 ───

interface SearchResultItem {
  projectId: string
  projectName: string
  filename: string
  title: string
  /** 匹配的内容摘要片段（全文搜索时返回） */
  snippet?: string
  /** 匹配来源: "title" | "content" */
  matchType: "title" | "content"
  /** 相关性分数（content 匹配时为 BM25 分数，title 匹配时为 1） */
  relevance: number
}

// 简易速率限制（内存计数器，每 IP 每分钟最多 30 次搜索）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30

let rateLimitEvictCounter = 0

function checkRateLimit(ip: string): boolean {
  const now = Date.now()

  // 每 50 次调用清理一次过期条目，防止内存无限增长
  if (++rateLimitEvictCounter % 50 === 0) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key)
    }
  }

  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

export default async function searchRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { q?: string; mode?: string }
  }>("/search", { preHandler: fastify.authenticate }, async (request, reply) => {
    const q = (request.query.q || "").trim().toLowerCase()
    const mode = request.query.mode || "all" // all | title | content

    if (!q) {
      return reply.send({ results: [] })
    }

    // 查询长度限制（防止超长查询句消耗资源）
    if (q.length > 200) {
      return reply.code(400).send({ results: [], error: "查询长度超出限制" })
    }

    // 速率限制
    const clientIp = request.headers["x-forwarded-for"]
      ? String(request.headers["x-forwarded-for"]).split(",")[0]?.trim()
      : request.ip || "unknown"
    if (!checkRateLimit(clientIp)) {
      return reply.code(429).send({ results: [], error: "请求过于频繁，请稍后重试" })
    }

    const { userId } = getAuthContext(request)

    try {
      const projects = await getProjects(userId)
      const results: SearchResultItem[] = []

      // ─── 阶段 1：标题/文件名匹配（快速，始终执行） ───
      if (mode === "all" || mode === "title") {
        await Promise.all(
          projects.map(async (project) => {
            const prefix = userProjectPrefix(userId, project.id)
            const files = await listFiles(prefix, true)
            for (const file of files) {
              const filename = file.pathname.slice(prefix.length)
              if (filename === "meta.json" || filename.startsWith(".") || filename.includes("/.")) continue

              const title = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")

              if (
                title.toLowerCase().includes(q) ||
                filename.toLowerCase().includes(q) ||
                project.name.toLowerCase().includes(q)
              ) {
                results.push({
                  projectId: project.id,
                  projectName: project.name,
                  filename,
                  title,
                  matchType: "title",
                  relevance: 1,
                })
              }
            }
          })
        )
      }

      // ─── 阶段 2：BM25 全文内容搜索（利用已有 RAG 索引） ───
      if (mode === "all" || mode === "content") {
        // 收集已有标题匹配的文件，避免重复
        const titleMatchKeys = new Set(
          results.map((r) => `${r.projectId}:${r.filename}`)
        )

        await Promise.all(
          projects.map(async (project) => {
            // 检查该项目是否已建立索引
            const status = await getIndexStatus(userId, project.id)
            if (!status?.indexed) return

            try {
              const bm25Results = await searchByBm25(userId, project.id, q, 5)
              for (const r of bm25Results) {
                const key = `${project.id}:${r.chunk.filename}`
                // 跳过已在标题匹配中出现的文件
                if (titleMatchKeys.has(key)) continue

                // 生成匹配摘要片段
                const snippet = extractSnippet(r.chunk.content, q, 120)

                results.push({
                  projectId: project.id,
                  projectName: project.name,
                  filename: r.chunk.filename,
                  title: r.chunk.fileTitle,
                  snippet,
                  matchType: "content",
                  relevance: r.score,
                })

                // 标记已添加，避免同一文件多个 chunk 重复出现
                titleMatchKeys.add(key)
              }
            } catch (err) {
              // BM25 搜索失败时静默跳过（索引可能损坏）
              console.warn(
                `[search] BM25 search failed for project ${project.id}:`,
                err
              )
            }
          })
        )
      }

      // ─── 排序：标题匹配优先，然后按相关性降序 ───
      results.sort((a, b) => {
        if (a.matchType !== b.matchType) {
          return a.matchType === "title" ? -1 : 1
        }
        return b.relevance - a.relevance
      })

      return reply.send({ results })
    } catch (err) {
      console.error("GET /search error:", err)
      return reply.code(500).send({ results: [], error: "搜索服务暂时不可用" })
    }
  })
}

// ─── 工具函数 ───

/**
 * 从文本中提取包含关键词的摘要片段
 * 在关键词周围取前后各 N 个字符作为上下文
 */
function extractSnippet(
  content: string,
  query: string,
  maxLength: number = 120
): string {
  const lowerContent = content.toLowerCase()
  let idx = lowerContent.indexOf(query)

  // 完整查询未匹配到时，尝试匹配查询中的各个词
  if (idx === -1) {
    const words = query.split(/\s+/).filter(w => w.length > 1)
    for (const word of words) {
      const wordIdx = lowerContent.indexOf(word)
      if (wordIdx !== -1) {
        idx = wordIdx
        break
      }
    }
  }

  if (idx === -1) {
    return content.slice(0, maxLength).replace(/\s+/g, " ").trim() + "\u2026"
  }

  const half = Math.floor((maxLength - query.length) / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(content.length, idx + query.length + half)

  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim()

  if (start > 0) snippet = "\u2026" + snippet
  if (end < content.length) snippet = snippet + "\u2026"

  return snippet
}
