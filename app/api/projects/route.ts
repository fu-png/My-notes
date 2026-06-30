import { NextRequest, NextResponse } from "next/server"
import { getProjects, createProject } from "@/lib/storage"

// 禁止缓存，确保每次请求都读取最新数据
export const dynamic = "force-dynamic"

// GET /api/projects — list all projects
export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json({ projects })
  } catch (err) {
    console.error("GET /api/projects error:", err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ projects: [], error: message }, { status: 500 })
  }
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = (body.name || "").trim()

    if (!name) {
      return NextResponse.json({ error: "项目名称不能为空" }, { status: 400 })
    }

    const project = await createProject(name)
    return NextResponse.json({ success: true, project })
  } catch (err) {
    console.error("POST /api/projects error:", err)
    const message = err instanceof Error ? err.message : String(err)
    // 如果是 Blob 未配置的错误，返回 503 让前端可以区分
    const isConfigError = message.includes("Blob") || message.includes("只读")
    return NextResponse.json(
      { error: message },
      { status: isConfigError ? 503 : 500 }
    )
  }
}
