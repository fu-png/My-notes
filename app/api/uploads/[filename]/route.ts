import { NextRequest, NextResponse } from "next/server"
import { readFile, deleteFile, fileExists } from "@/lib/storage"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const decodedFilename = decodeURIComponent(filename)
  const pathname = `uploads/${decodedFilename}`

  try {
    const content = await readFile(pathname)
    if (content === null) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    return NextResponse.json({
      filename: decodedFilename,
      title: decodedFilename.replace(/\.md$/, ""),
      content,
    })
  } catch {
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const decodedFilename = decodeURIComponent(filename)
  const pathname = `uploads/${decodedFilename}`

  const exists = await fileExists(pathname)
  if (!exists) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 })
  }

  try {
    await deleteFile(pathname)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "删除失败" }, { status: 500 })
  }
}
