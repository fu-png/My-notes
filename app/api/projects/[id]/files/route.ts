import { NextRequest, NextResponse } from "next/server"
import { uploadFileToProject, fileExists } from "@/lib/storage"
import path from "path"

// Supported file extensions
const SUPPORTED_EXTENSIONS = [
  ".md", ".txt", ".json", ".yaml", ".yml",
  ".csv", ".tsv", ".xml", ".html", ".htm",
  ".js", ".ts", ".jsx", ".tsx", ".css",
  ".py", ".go", ".java", ".rs", ".sh",
  ".toml", ".ini", ".env", ".log",
  ".pdf", ".docx", ".xlsx", ".pptx",
]

function isSupportedFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

// POST /api/projects/[id]/files — upload file(s) to a project (supports batch)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 验证项目是否存在
  const projectExists = await fileExists(`projects/${id}/meta.json`)
  if (!projectExists) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll("file") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "未选择文件" }, { status: 400 })
    }

    const results: { success: boolean; filename: string; title: string; error?: string }[] = []

    for (const file of files) {
      if (!isSupportedFile(file.name)) {
        results.push({
          success: false,
          filename: file.name,
          title: file.name,
          error: "不支持的文件格式",
        })
        continue
      }

      const result = await uploadFileToProject(id, file)
      results.push(result)
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return NextResponse.json({
      success: successCount > 0,
      results,
      summary: { total: files.length, success: successCount, failed: failCount },
      // Backward compatibility for single file upload
      ...(results.length === 1 && results[0].success
        ? { filename: results[0].filename, title: results[0].title }
        : {}),
    })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: "上传失败" }, { status: 500 })
  }
}
