import { NextRequest, NextResponse } from "next/server"
import { getProjects, listFiles } from "@/lib/storage"
import { searchByBm25 } from "@/lib/rag/bm25-store"
import { getIndexStatus } from "@/lib/rag/pipeline"

export const dynamic = "force-dynamic"

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

// GET /api/search?q=keyword&mode=all|title|content — 跨项目搜索
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase()
  const mode = request.nextUrl.searchParams.get("mode") || "all" // all | title | content
  if (!q) {
    return NextResponse.json({ results: [] })
  }

  try {
    const projects = await getProjects()
    const results: SearchResultItem[] = []

    // ─── 阶段 1：标题/文件名匹配（快速，始终执行） ───
    if (mode === "all" || mode === "title") {
      await Promise.all(
        projects.map(async (project) => {
          const files = await listFiles(`projects/${project.id}/`, true)
          for (const file of files) {
            const filename = file.pathname.slice(`projects/${project.id}/`.length)
            if (filename === "meta.json" || filename.startsWith(".") || filename.includes("/.")) continue

            const title = filename.replace(/\.[^.]+$/, "")

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
          const status = await getIndexStatus(project.id)
          if (!status?.indexed) return

          try {
            const bm25Results = await searchByBm25(project.id, q, 5)
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
      // 标题匹配优先
      if (a.matchType !== b.matchType) {
        return a.matchType === "title" ? -1 : 1
      }
      // 同类型按相关性降序
      return b.relevance - a.relevance
    })

    return NextResponse.json({ results })
  } catch (err) {
    console.error("GET /api/search error:", err)
    return NextResponse.json(
      { results: [], error: String(err) },
      { status: 500 }
    )
  }
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
  const idx = lowerContent.indexOf(query)

  if (idx === -1) {
    // 关键词未直接出现（可能是分词匹配），返回开头摘要
    return content.slice(0, maxLength).replace(/\s+/g, " ").trim() + "…"
  }

  const half = Math.floor((maxLength - query.length) / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(content.length, idx + query.length + half)

  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim()

  if (start > 0) snippet = "…" + snippet
  if (end < content.length) snippet = snippet + "…"

  return snippet
}
