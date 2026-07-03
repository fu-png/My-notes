import { NextRequest, NextResponse } from "next/server"
import { writeFile, fileExists } from "@/lib/storage"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "未选择文件" }, { status: 400 })
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件大小不能超过 10MB" }, { status: 413 })
    }

    // Only accept .md files
    if (!file.name.endsWith(".md")) {
      return NextResponse.json(
        { error: "仅支持 .md 格式的 Markdown 文件" },
        { status: 400 }
      )
    }

    const safeFilename = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_")
    let finalFilename = safeFilename

    // If file already exists, add timestamp suffix
    const exists = await fileExists(`uploads/${safeFilename}`)
    if (exists) {
      const ext = path.extname(safeFilename)
      const base = path.basename(safeFilename, ext)
      finalFilename = `${base}_${Date.now()}${ext}`
    }

    const content = await file.text()
    await writeFile(`uploads/${finalFilename}`, content, {
      contentType: "text/markdown",
    })

    return NextResponse.json({
      success: true,
      filename: finalFilename,
      title: finalFilename.replace(/\.md$/, ""),
    })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: "上传失败" }, { status: 500 })
  }
}
