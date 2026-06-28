/**
 * 统一存储层 - 支持 Vercel Blob (生产) 和本地文件系统 (开发)
 *
 * 数据组织结构:
 * - projects/{projectId}/meta.json   — 项目元数据
 * - projects/{projectId}/{filename}  — 项目文件
 * - uploads/{filename}               — 独立上传文件
 */

import { put, list, del, head } from "@vercel/blob"
import fs from "fs"
import path from "path"

// 是否运行在 Vercel 生产环境（此时文件系统只读，必须使用 Blob）
const IS_VERCEL_PRODUCTION = !!process.env.VERCEL_ENV

// 是否使用 Blob 存储
// 支持 OIDC 认证（BLOB_STORE_ID + VERCEL_OIDC_TOKEN，Vercel 默认）和静态 Token（BLOB_READ_WRITE_TOKEN）
const USE_BLOB =
  !!process.env.BLOB_READ_WRITE_TOKEN ||
  (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN)

// 如果在 Vercel 生产环境但未配置 Blob，提前报错
if (IS_VERCEL_PRODUCTION && !USE_BLOB) {
  console.error(
    "[storage] Vercel 生产环境检测到未配置 Blob 存储。请在 Vercel Dashboard 创建 Blob Store，或设置 BLOB_READ_WRITE_TOKEN 环境变量。"
  )
}

const LOCAL_CONTENT_DIR = path.join(process.cwd(), "content")

// ============================================================
// 接口定义
// ============================================================

export interface StoredFile {
  pathname: string     // 存储路径 (如 "projects/proj-123/readme.md")
  url: string          // 可访问的 URL（Blob 为 CDN URL，本地为 API URL）
  size: number
  uploadedAt: Date
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: string
  fileCount?: number
}

// ============================================================
// 核心存储操作
// ============================================================

/** 写入文件内容 */
export async function writeFile(
  pathname: string,
  content: string | Buffer | File,
  options?: { contentType?: string }
): Promise<StoredFile> {
  if (USE_BLOB) {
    const blob = await put(pathname, content, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: options?.contentType,
    })
    return {
      pathname: blob.pathname,
      url: blob.url,
      size: typeof content === "string" ? Buffer.byteLength(content) : (content instanceof Buffer ? content.length : (content as File).size),
      uploadedAt: new Date(),
    }
  }

  // 本地文件系统
  // Vercel 线上环境文件系统只读，必须配置 Blob
  if (IS_VERCEL_PRODUCTION) {
    throw new Error(
      "Vercel 生产环境文件系统只读，无法写入文件。请前往 Vercel Dashboard → Storage → 创建 Blob Store，系统会自动注入 BLOB_READ_WRITE_TOKEN 环境变量。"
    )
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (content instanceof Buffer) {
    fs.writeFileSync(filePath, content)
  } else if (typeof content === "string") {
    fs.writeFileSync(filePath, content, "utf-8")
  } else {
    // File object
    const buffer = Buffer.from(await (content as File).arrayBuffer())
    fs.writeFileSync(filePath, buffer)
  }

  const stat = fs.statSync(filePath)
  return {
    pathname,
    url: `/api/blob/${pathname}`,
    size: stat.size,
    uploadedAt: stat.mtime,
  }
}

/** 读取文件内容（文本） */
export async function readFile(pathname: string): Promise<string | null> {
  if (USE_BLOB) {
    try {
      const blobInfo = await findBlobByPathname(pathname)
      if (!blobInfo) return null
      const response = await fetch(blobInfo.url)
      if (!response.ok) return null
      return response.text()
    } catch {
      return null
    }
  }

  // 本地文件系统
  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, "utf-8")
}

/** 读取文件为 Buffer（二进制） */
export async function readFileBuffer(pathname: string): Promise<Buffer | null> {
  if (USE_BLOB) {
    try {
      const blobInfo = await findBlobByPathname(pathname)
      if (!blobInfo) return null
      const response = await fetch(blobInfo.url)
      if (!response.ok) return null
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch {
      return null
    }
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath)
}

/** 检查文件是否存在 */
export async function fileExists(pathname: string): Promise<boolean> {
  if (USE_BLOB) {
    const blob = await findBlobByPathname(pathname)
    return blob !== null
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  return fs.existsSync(filePath)
}

/** 删除文件 */
export async function deleteFile(pathname: string): Promise<boolean> {
  if (USE_BLOB) {
    try {
      const blob = await findBlobByPathname(pathname)
      if (!blob) return false
      await del(blob.url)
      return true
    } catch {
      return false
    }
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}

/** 删除指定前缀下的所有文件 */
export async function deletePrefix(prefix: string): Promise<boolean> {
  if (USE_BLOB) {
    try {
      let cursor: string | undefined
      const urls: string[] = []
      do {
        const result = await list({ prefix, limit: 1000, cursor })
        urls.push(...result.blobs.map((b) => b.url))
        cursor = result.hasMore ? result.cursor : undefined
      } while (cursor)

      if (urls.length > 0) {
        await del(urls)
      }
      return true
    } catch {
      return false
    }
  }

  const dirPath = path.join(LOCAL_CONTENT_DIR, prefix)
  if (!fs.existsSync(dirPath)) return false
  fs.rmSync(dirPath, { recursive: true, force: true })
  return true
}

/** 列出指定前缀下的文件 */
export async function listFiles(prefix: string): Promise<{ pathname: string; url: string; size: number }[]> {
  if (USE_BLOB) {
    const results: { pathname: string; url: string; size: number }[] = []
    let cursor: string | undefined
    do {
      const result = await list({ prefix, limit: 1000, cursor })
      results.push(
        ...result.blobs.map((b) => ({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
        }))
      )
      cursor = result.hasMore ? result.cursor : undefined
    } while (cursor)
    return results
  }

  // 本地文件系统
  const dirPath = path.join(LOCAL_CONTENT_DIR, prefix)
  if (!fs.existsSync(dirPath)) return []

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const fullPath = path.join(dirPath, e.name)
      const stat = fs.statSync(fullPath)
      return {
        pathname: `${prefix}${e.name}`,
        url: `/api/blob/${prefix}${e.name}`,
        size: stat.size,
      }
    })
}

/** 列出指定前缀下的子目录 */
export async function listDirectories(prefix: string): Promise<string[]> {
  if (USE_BLOB) {
    // Blob 存储通过 folded mode 列出虚拟目录
    const result = await list({ prefix, mode: "folded" })
    return (result.folders ?? []).map((folder) => folder)
  }

  const dirPath = path.join(LOCAL_CONTENT_DIR, prefix)
  if (!fs.existsSync(dirPath)) return []

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${prefix}${e.name}/`)
}

// ============================================================
// 项目相关高级操作
// ============================================================

/** 获取所有项目列表 */
export async function getProjects(): Promise<ProjectMeta[]> {
  if (USE_BLOB) {
    // 列出所有项目的 meta.json
    const metaFiles = await listFiles("projects/")
    const metaBlobs = metaFiles.filter((f) => f.pathname.endsWith("/meta.json"))

    const projects: ProjectMeta[] = []
    for (const metaBlob of metaBlobs) {
      try {
        const response = await fetch(metaBlob.url)
        if (!response.ok) continue
        const meta = await response.json() as ProjectMeta

        // 计算文件数量：同项目前缀下的文件数 - 1（meta.json）
        const projectPrefix = metaBlob.pathname.replace("meta.json", "")
        const allFiles = metaFiles.filter(
          (f) => f.pathname.startsWith(projectPrefix) && f.pathname !== metaBlob.pathname
        )
        projects.push({ ...meta, fileCount: allFiles.length })
      } catch {
        continue
      }
    }

    projects.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    return projects
  }

  // 本地文件系统
  const projectsDir = path.join(LOCAL_CONTENT_DIR, "projects")
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true })
    return []
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
  const projects: ProjectMeta[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metaPath = path.join(projectsDir, entry.name, "meta.json")
    try {
      const raw = fs.readFileSync(metaPath, "utf-8")
      const meta = JSON.parse(raw) as ProjectMeta
      const files = fs
        .readdirSync(path.join(projectsDir, entry.name))
        .filter((f) => f !== "meta.json" && !f.startsWith("."))
      projects.push({ ...meta, fileCount: files.length })
    } catch {
      continue
    }
  }

  projects.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  return projects
}

/** 获取单个项目详情 */
export async function getProject(id: string): Promise<{ meta: ProjectMeta; files: { filename: string; title: string }[] } | null> {
  const metaContent = await readFile(`projects/${id}/meta.json`)
  if (!metaContent) return null

  try {
    const meta = JSON.parse(metaContent) as ProjectMeta

    // 列出项目下的所有文件（排除 meta.json）
    const allFiles = await listFiles(`projects/${id}/`)
    const files = allFiles
      .filter((f) => !f.pathname.endsWith("/meta.json"))
      .map((f) => {
        const filename = f.pathname.split("/").pop() ?? ""
        return {
          filename,
          title: filename.replace(/\.[^.]+$/, ""),
        }
      })

    return { meta: { ...meta, fileCount: files.length }, files }
  } catch {
    return null
  }
}

/** 创建项目 */
export async function createProject(name: string): Promise<ProjectMeta> {
  const id = `proj-${Date.now()}`
  const meta: ProjectMeta = {
    id,
    name,
    createdAt: new Date().toISOString(),
  }

  await writeFile(
    `projects/${id}/meta.json`,
    JSON.stringify(meta, null, 2),
    { contentType: "application/json" }
  )

  return { ...meta, fileCount: 0 }
}

/** 上传文件到项目 */
export async function uploadFileToProject(
  projectId: string,
  file: File
): Promise<{ success: boolean; filename: string; title: string; error?: string }> {
  const safeFilename = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_")
  let finalFilename = safeFilename

  // 如果文件已存在，添加时间戳后缀
  const exists = await fileExists(`projects/${projectId}/${safeFilename}`)
  if (exists) {
    const ext = path.extname(safeFilename)
    const base = path.basename(safeFilename, ext)
    finalFilename = `${base}_${Date.now()}${ext}`
  }

  const pathname = `projects/${projectId}/${finalFilename}`
  await writeFile(pathname, file, { contentType: file.type || undefined })

  return {
    success: true,
    filename: finalFilename,
    title: finalFilename.replace(/\.[^.]+$/, ""),
  }
}

// ============================================================
// 辅助函数
// ============================================================

/** 在 Blob 存储中通过 pathname 查找文件 */
async function findBlobByPathname(pathname: string) {
  try {
    const result = await list({ prefix: pathname, limit: 1 })
    const exact = result.blobs.find((b) => b.pathname === pathname)
    if (exact) {
      return { url: exact.url, pathname: exact.pathname, size: exact.size }
    }
    return null
  } catch {
    return null
  }
}

// 导出 head 用于检查元数据
export { head as blobHead }
