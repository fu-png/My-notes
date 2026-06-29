import { NextRequest, NextResponse } from "next/server"
import { readFile, deleteFile, fileExists, renameFile } from "@/lib/storage"

// GET /api/projects/[id]/files/[filename] — read file content
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params
  const decodedFilename = decodeURIComponent(filename)
  const pathname = `projects/${id}/${decodedFilename}`

  try {
    const content = await readFile(pathname)
    if (content === null) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    return NextResponse.json({
      filename: decodedFilename,
      title: decodedFilename.replace(/\.[^.]+$/, ""),
      content,
    })
  } catch {
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

// PATCH /api/projects/[id]/files/[filename] — rename a file
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params
  const decodedFilename = decodeURIComponent(filename)
  const oldPathname = `projects/${id}/${decodedFilename}`

  try {
    const body = await request.json()
    const newFilename = body.newFilename as string | undefined
    if (!newFilename || typeof newFilename !== "string" || !newFilename.trim()) {
      return NextResponse.json({ error: "新文件名不能为空" }, { status: 400 })
    }

    const trimmed = newFilename.trim()
    // 不允许包含路径分隔符
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      return NextResponse.json({ error: "文件名不能包含路径分隔符" }, { status: 400 })
    }

    const newPathname = `projects/${id}/${trimmed}`

    if (oldPathname === newPathname) {
      return NextResponse.json({ success: true, filename: trimmed })
    }

    const success = await renameFile(oldPathname, newPathname)
    if (!success) {
      // 可能是旧文件不存在或新文件名已被占用
      const oldExists = await fileExists(oldPathname)
      if (!oldExists) {
        return NextResponse.json({ error: "原文件不存在" }, { status: 404 })
      }
      return NextResponse.json({ error: "重命名失败，目标文件名可能已存在" }, { status: 409 })
    }

    return NextResponse.json({ success: true, filename: trimmed })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重命名失败"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/projects/[id]/files/[filename] — delete a file
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params
  const decodedFilename = decodeURIComponent(filename)
  const pathname = `projects/${id}/${decodedFilename}`

  const exists = await fileExists(pathname)
  if (!exists) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 })
  }

  try {
    const success = await deleteFile(pathname)
    if (!success) {
      return NextResponse.json({ error: "删除失败，文件可能在 Blob 存储中未找到" }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "删除失败"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
