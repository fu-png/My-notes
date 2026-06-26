import { NextRequest, NextResponse } from "next/server"
import { getProjects, createProject } from "@/lib/storage"

// GET /api/projects — list all projects
export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json({ projects })
  } catch {
    return NextResponse.json({ projects: [] })
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
    console.error("Create project error:", err)
    return NextResponse.json({ error: "创建项目失败" }, { status: 500 })
  }
}
