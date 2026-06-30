import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getProject, deletePrefix, readFile, writeFile } from "@/lib/storage"

export const dynamic = "force-dynamic"

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

// PATCH /api/projects/[id] — update project metadata (e.g. rename)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { name } = body as { name?: string }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "名称不能为空" }, { status: 400 })
    }

    const metaPath = `projects/${id}/meta.json`
    const raw = await readFile(metaPath)
    if (!raw) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }

    const meta = JSON.parse(raw)
    meta.name = name.trim()

    await writeFile(metaPath, JSON.stringify(meta, null, 2), {
      contentType: "application/json",
    })

    // 清除详情页和列表页的路由缓存，确保名称更新立即生效
    revalidatePath(`/docs/projects/${id}`)
    revalidatePath("/docs/projects")

    return NextResponse.json({ success: true, project: meta })
  } catch {
    return NextResponse.json({ error: "更新项目失败" }, { status: 500 })
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
