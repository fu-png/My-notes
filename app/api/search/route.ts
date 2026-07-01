import { NextRequest, NextResponse } from "next/server"
import { getProjects, listFiles } from "@/lib/storage"

export const dynamic = "force-dynamic"

// GET /api/search?q=keyword — 跨项目搜索文件
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase()
  if (!q) {
    return NextResponse.json({ results: [] })
  }

  try {
    const projects = await getProjects()

    const results: {
      projectId: string
      projectName: string
      filename: string
      title: string
    }[] = []

    await Promise.all(
      projects.map(async (project) => {
        const files = await listFiles(`projects/${project.id}/`)
        for (const file of files) {
          // 跳过 meta.json 和隐藏文件
          const filename = file.pathname.split("/").pop() || ""
          if (filename === "meta.json" || filename.startsWith(".")) continue

          // 生成显示标题（去掉扩展名）
          const title = filename.replace(/\.[^.]+$/, "")

          // 搜索匹配：文件名或项目名
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
            })
          }
        }
      })
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error("GET /api/search error:", err)
    return NextResponse.json({ results: [], error: String(err) }, { status: 500 })
  }
}
