import { NextRequest, NextResponse } from "next/server"
import { getProject, deletePrefix } from "@/lib/storage"

// GET /api/projects/[id] — get project detail with file list
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const result = await getProject(id)
    if (!result) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }

    return NextResponse.json({ project: result.meta, files: result.files })
  } catch {
    return NextResponse.json({ error: "读取项目失败" }, { status: 500 })
  }
}

// DELETE /api/projects/[id] — delete entire project
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const success = await deletePrefix(`projects/${id}/`)
    if (!success) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "删除项目失败" }, { status: 500 })
  }
}
