import { NextRequest, NextResponse } from "next/server"
import { readFile, deleteFile, fileExists } from "@/lib/storage"
import { sanitizeFilename } from "@/lib/validation"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const decodedFilename = decodeURIComponent(filename)

  // 路径遍历防护
  if (decodedFilename.includes('..') || decodedFilename.includes('/') || decodedFilename.includes('\\')) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 })
  }
  const safeFilename = sanitizeFilename(decodedFilename)
  const pathname = `uploads/${safeFilename}`

  try {
    const content = await readFile(pathname)
    if (content === null) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    return NextResponse.json({
      filename: safeFilename,
      title: safeFilename.replace(/\.md$/, ""),
      content,
    })
  } catch (error) {
    console.error("[uploads/[filename]]", error)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const decodedFilename = decodeURIComponent(filename)

  // 路径遍历防护
  if (decodedFilename.includes('..') || decodedFilename.includes('/') || decodedFilename.includes('\\')) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 })
  }
  const safeFilename = sanitizeFilename(decodedFilename)
  const pathname = `uploads/${safeFilename}`

  const exists = await fileExists(pathname)
  if (!exists) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 })
  }

  try {
    await deleteFile(pathname)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[uploads/[filename]]", error)
    return NextResponse.json({ error: "删除失败" }, { status: 500 })
  }
}
