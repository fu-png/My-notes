import { NextRequest, NextResponse } from "next/server"
import { readFile, deleteFile, fileExists, renameFile, writeFile, getFileMeta, uploadFileToProject } from "@/lib/storage"
import { isValidProjectId, sanitizeFilename } from "@/lib/validation"
import path from "path"

// Supported file extensions for upload
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

// 二进制/非文本资源扩展名 — 这些文件（如 TTS 生成的音频）不应作为文本内容读取，
// 避免二进制数据被当作字符串塞入 JSON 响应，在前端渲染为乱码
const BINARY_EXTENSIONS = [
  ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".mp4", ".mov", ".webm",
]

function isBinaryFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return BINARY_EXTENSIONS.includes(ext)
}

// POST /api/projects/[id]/files — upload file(s) to a project (supports batch)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id } = await params

  // 校验 projectId 格式
  if (!isValidProjectId(id)) {
    return NextResponse.json({ error: "无效的项目 ID" }, { status: 400 })
  }

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

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          success: false,
          filename: file.name,
          title: file.name,
          error: "文件大小不能超过 10MB",
        })
        continue
      }

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

// GET /api/projects/[id]/files/[...pathname] — read file content
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname: pathnameSegments } = await params
  const decodedPathname = pathnameSegments ? pathnameSegments.join("/") : ""

  // 校验 projectId 格式
  if (!isValidProjectId(id)) {
    return NextResponse.json({ error: "无效的项目 ID" }, { status: 400 })
  }

  // 防止路径遍历：拒绝包含 .. 的路径段
  if (decodedPathname.includes("..")) {
    return NextResponse.json({ error: "非法的文件路径" }, { status: 400 })
  }

  const pathname = `projects/${id}/${decodedPathname}`

  // 二进制资源（如 .audio 目录下的 TTS 音频）不应作为文本内容返回，
  // 否则二进制数据被塞入 JSON 会在前端渲染为乱码
  if (isBinaryFile(decodedPathname)) {
    return NextResponse.json(
      { error: "该文件为二进制资源，不支持文本预览", isBinary: true },
      { status: 415 }
    )
  }

  try {
    const [content, meta] = await Promise.all([
      readFile(pathname),
      getFileMeta(pathname),
    ])
    if (content === null) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    return NextResponse.json({
      filename: decodedPathname,
      title: decodedPathname.split("/").pop()?.replace(/\.[^.]+$/, "") || decodedPathname,
      content,
      lastModified: meta?.lastModified || Date.now(),
    })
  } catch {
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

// PUT /api/projects/[id]/files/[...pathname] — update file content
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname: pathnameSegments } = await params
  const decodedPathname = pathnameSegments ? pathnameSegments.join("/") : ""

  // 校验 projectId 格式
  if (!isValidProjectId(id)) {
    return NextResponse.json({ error: "无效的项目 ID" }, { status: 400 })
  }

  // 防止路径遍历：拒绝包含 .. 的路径段
  if (decodedPathname.includes("..")) {
    return NextResponse.json({ error: "非法的文件路径" }, { status: 400 })
  }

  const pathname = `projects/${id}/${decodedPathname}`

  try {
    const body = await request.json()
    const content = body.content as string | undefined
    if (content === undefined || content === null) {
      return NextResponse.json({ error: "缺少 content 字段" }, { status: 400 })
    }

    const exists = await fileExists(pathname)
    if (!exists) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    await writeFile(pathname, content, { contentType: "text/markdown; charset=utf-8" })
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "保存失败"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/projects/[id]/files/[...pathname] — rename a file
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname: pathnameSegments } = await params
  const decodedPathname = pathnameSegments ? pathnameSegments.join("/") : ""

  // 校验 projectId 格式
  if (!isValidProjectId(id)) {
    return NextResponse.json({ error: "无效的项目 ID" }, { status: 400 })
  }

  // 防止路径遍历：拒绝包含 .. 的路径段
  if (decodedPathname.includes("..")) {
    return NextResponse.json({ error: "非法的文件路径" }, { status: 400 })
  }

  const oldPathname = `projects/${id}/${decodedPathname}`

  try {
    const body = await request.json()
    const newFilename = body.newFilename as string | undefined
    if (!newFilename || typeof newFilename !== "string" || !newFilename.trim()) {
      return NextResponse.json({ error: "新文件名不能为空" }, { status: 400 })
    }

    // 过滤危险字符
    const trimmed = sanitizeFilename(newFilename)
    const newPathname = `projects/${id}/${trimmed}`

    if (oldPathname === newPathname) {
      return NextResponse.json({ success: true, filename: trimmed })
    }

    const success = await renameFile(oldPathname, newPathname)
    if (!success) {
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

// DELETE /api/projects/[id]/files/[...pathname] — delete a file
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname: pathnameSegments } = await params
  const decodedPathname = pathnameSegments ? pathnameSegments.join("/") : ""

  // 校验 projectId 格式
  if (!isValidProjectId(id)) {
    return NextResponse.json({ error: "无效的项目 ID" }, { status: 400 })
  }

  // 防止路径遍历：拒绝包含 .. 的路径段
  if (decodedPathname.includes("..")) {
    return NextResponse.json({ error: "非法的文件路径" }, { status: 400 })
  }

  const pathname = `projects/${id}/${decodedPathname}`

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
