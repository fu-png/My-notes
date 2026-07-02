/**
 * 统一存储层 - 支持阿里云 OSS (生产) 和本地文件系统 (开发)
 *
 * 数据组织结构:
 * - projects/{projectId}/meta.json   — 项目元数据
 * - projects/{projectId}/{filename}  — 项目文件
 * - uploads/{filename}               — 独立上传文件
 */

import OSS from "ali-oss"
import fs from "fs"
import path from "path"

// 是否使用阿里云 OSS
const USE_OSS = !!process.env.OSS_ACCESS_KEY_ID && !!process.env.OSS_ACCESS_KEY_SECRET

// 是否运行在 Vercel 生产环境（文件系统只读，必须使用 OSS）
const IS_VERCEL_PRODUCTION = !!process.env.VERCEL_ENV

if (IS_VERCEL_PRODUCTION && !USE_OSS) {
  console.error(
    "[storage] Vercel 生产环境检测到未配置 OSS 存储。请设置 OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_BUCKET、OSS_REGION 环境变量。"
  )
}

// 阿里云 OSS 客户端（懒初始化）
let _ossClient: OSS | null = null

function getOSSClient(): OSS {
  if (!_ossClient) {
    _ossClient = new OSS({
      region: process.env.OSS_REGION || "oss-cn-beijing",
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
      bucket: process.env.OSS_BUCKET || "my-notes-fzc",
      timeout: 300000, // 300s — Vercel US → OSS Beijing 跨区域上传音频文件需要足够长的超时
    })
  }
  return _ossClient
}

const LOCAL_CONTENT_DIR = path.join(process.cwd(), "content")

// ============================================================
// 接口定义
// ============================================================

export interface StoredFile {
  pathname: string     // 存储路径 (如 "projects/proj-123/readme.md")
  url: string          // 可访问的 URL
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
  if (USE_OSS) {
    const client = getOSSClient()
    let buffer: Buffer
    if (typeof content === "string") {
      buffer = Buffer.from(content, "utf-8")
    } else if (content instanceof Buffer) {
      buffer = content
    } else {
      buffer = Buffer.from(await (content as File).arrayBuffer())
    }

    const ossOptions: OSS.PutObjectOptions = {}
    if (options?.contentType) {
      ossOptions.headers = { "Content-Type": options.contentType }
    }
    // 对大文件（>500KB）使用更长的超时，防止跨区域上传失败
    if (buffer.length > 512 * 1024) {
      ossOptions.timeout = 600000 // 10 分钟
    }

    const result = await client.put(pathname, buffer, ossOptions)

    return {
      pathname,
      url: result.url,
      size: buffer.length,
      uploadedAt: new Date(),
    }
  }

  // 本地文件系统
  if (IS_VERCEL_PRODUCTION) {
    throw new Error("Vercel 生产环境文件系统只读，无法写入文件。请配置阿里云 OSS 环境变量。")
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
  if (USE_OSS) {
    try {
      const client = getOSSClient()
      const result = await client.get(pathname)
      if (result.content) {
        return Buffer.isBuffer(result.content)
          ? result.content.toString("utf-8")
          : String(result.content)
      }
      return null
    } catch (err: unknown) {
      if (isOSSNotFound(err)) return null
      console.error("[storage] readFile error:", err)
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
  if (USE_OSS) {
    try {
      const client = getOSSClient()
      const result = await client.get(pathname)
      if (result.content) {
        return Buffer.isBuffer(result.content)
          ? result.content
          : Buffer.from(result.content as ArrayBuffer)
      }
      return null
    } catch (err: unknown) {
      if (isOSSNotFound(err)) return null
      console.error("[storage] readFileBuffer error:", err)
      return null
    }
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath)
}

/** 检查文件是否存在 */
export async function fileExists(pathname: string): Promise<boolean> {
  if (USE_OSS) {
    try {
      const client = getOSSClient()
      await client.head(pathname)
      return true
    } catch (err: unknown) {
      if (isOSSNotFound(err)) return false
      console.error("[storage] fileExists error:", err)
      return false
    }
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  return fs.existsSync(filePath)
}

/** 删除文件 */
export async function deleteFile(pathname: string): Promise<boolean> {
  if (USE_OSS) {
    try {
      const client = getOSSClient()
      await client.delete(pathname)
      return true
    } catch (err) {
      console.error("[storage] deleteFile error:", err)
      return false
    }
  }

  if (IS_VERCEL_PRODUCTION) {
    throw new Error("Vercel 生产环境文件系统只读，无法删除文件。请配置阿里云 OSS 环境变量。")
  }

  const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}

/** 重命名文件（复制到新路径，删除旧文件） */
export async function renameFile(oldPathname: string, newPathname: string): Promise<boolean> {
  const exists = await fileExists(oldPathname)
  if (!exists) return false

  const newExists = await fileExists(newPathname)
  if (newExists) return false

  if (USE_OSS) {
    try {
      const client = getOSSClient()
      const bucket = process.env.OSS_BUCKET || "my-notes-fzc"
      // OSS copy 需要完整的 source key: /bucket/key
      await client.copy(newPathname, `/${bucket}/${oldPathname}`)
      await client.delete(oldPathname)
      return true
    } catch (err) {
      console.error("[storage] renameFile error:", err)
      return false
    }
  }

  if (IS_VERCEL_PRODUCTION) {
    throw new Error("Vercel 生产环境文件系统只读，无法重命名文件。请配置阿里云 OSS 环境变量。")
  }

  const oldPath = path.join(LOCAL_CONTENT_DIR, oldPathname)
  const newPath = path.join(LOCAL_CONTENT_DIR, newPathname)
  const dir = path.dirname(newPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.renameSync(oldPath, newPath)
  return true
}

/** 删除指定前缀下的所有文件 */
export async function deletePrefix(prefix: string): Promise<boolean> {
  if (USE_OSS) {
    try {
      const client = getOSSClient()
      // 列出所有匹配前缀的对象
      let marker: string | undefined
      const keys: string[] = []
      do {
        const result = await client.listV2({
          prefix,
          "max-keys": 1000,
          "continuation-token": marker,
        })
        if (result.objects) {
          keys.push(...result.objects.map((obj: OSS.ObjectMeta) => obj.name))
        }
        marker = result.nextContinuationToken || undefined
      } while (marker)

      if (keys.length > 0) {
        // OSS 批量删除，每次最多 1000 个
        for (let i = 0; i < keys.length; i += 1000) {
          const batch = keys.slice(i, i + 1000)
          await client.deleteMulti(batch, { quiet: true })
        }
      }
      return true
    } catch (err) {
      console.error("[storage] deletePrefix error:", err)
      return false
    }
  }

  if (IS_VERCEL_PRODUCTION) {
    throw new Error("Vercel 生产环境文件系统只读，无法删除目录。请配置阿里云 OSS 环境变量。")
  }

  const dirPath = path.join(LOCAL_CONTENT_DIR, prefix)
  if (!fs.existsSync(dirPath)) return false
  fs.rmSync(dirPath, { recursive: true, force: true })
  return true
}

/** 列出指定前缀下的文件 */
export async function listFiles(prefix: string, recursive: boolean = false): Promise<{ pathname: string; url: string; size: number; lastModified: number }[]> {
  if (USE_OSS) {
    const client = getOSSClient()
    const results: { pathname: string; url: string; size: number; lastModified: number }[] = []
    let marker: string | undefined
    do {
      const result = await client.listV2({
        prefix,
        "max-keys": 1000,
        "continuation-token": marker,
      })
      if (result.objects) {
        for (const obj of result.objects) {
          // 跳过"目录"占位对象（以 / 结尾且 size 为 0）
          if (obj.name.endsWith("/") && obj.size === 0) continue
          const url = getOSSUrl(obj.name)
          results.push({
            pathname: obj.name,
            url,
            size: obj.size,
            lastModified: obj.lastModified ? new Date(obj.lastModified).getTime() : Date.now(),
          })
        }
      }
      marker = result.nextContinuationToken || undefined
    } while (marker)
    return results
  }

  // 本地文件系统
  const dirPath = path.join(LOCAL_CONTENT_DIR, prefix)
  if (!fs.existsSync(dirPath)) return []

  const results: { pathname: string; url: string; size: number; lastModified: number }[] = []

  function scanDir(currentDir: string, currentPrefix: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const e of entries) {
      const fullPath = path.join(currentDir, e.name)
      const itemPathname = `${currentPrefix}${e.name}`
      if (e.isDirectory()) {
        if (recursive) {
          scanDir(fullPath, `${itemPathname}/`)
        }
      } else {
        const stat = fs.statSync(fullPath)
        results.push({
          pathname: itemPathname,
          url: `/api/blob/${itemPathname}`,
          size: stat.size,
          lastModified: stat.mtime.getTime(),
        })
      }
    }
  }

  scanDir(dirPath, prefix)
  return results
}

/** 列出指定前缀下的子目录 */
export async function listDirectories(prefix: string): Promise<string[]> {
  if (USE_OSS) {
    const client = getOSSClient()
    const result = await client.listV2({
      prefix,
      delimiter: "/",
      "max-keys": 1000,
    })
    // commonPrefixes 包含虚拟目录
    return (result.prefixes || []).map((p: string) => p)
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
  if (USE_OSS) {
    const client = getOSSClient()
    const metaFiles = await listFiles("projects/")
    const metaBlobs = metaFiles.filter((f) => f.pathname.endsWith("/meta.json"))

    const projects: ProjectMeta[] = []
    for (const metaBlob of metaBlobs) {
      try {
        const result = await client.get(metaBlob.pathname)
        const content = Buffer.isBuffer(result.content)
          ? result.content.toString("utf-8")
          : String(result.content)
        const meta = JSON.parse(content) as ProjectMeta

        const projectPrefix = metaBlob.pathname.replace("meta.json", "")
        const allFiles = metaFiles.filter(
          (f) =>
            f.pathname.startsWith(projectPrefix) &&
            f.pathname !== metaBlob.pathname &&
            !f.pathname.endsWith("/chat-history.json") &&
            !f.pathname.slice(projectPrefix.length).includes("/")
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
          .filter((f) => f !== "meta.json" && f !== "chat-history.json" && !f.startsWith("."))
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

/** 从文件内容第一行提取标题，回退到文件名 */
function extractTitleFromContent(content: string | null, filename: string): string {
  const fallback = filename.replace(/\.[^.]+$/, "")
  if (!content) return fallback
  const firstLine = content.trim().split("\n")[0]?.trim()
  if (!firstLine) return fallback
  const title = firstLine.replace(/^#{1,6}\s*/, "").trim()
  .replace(/\*\*(.+?)\*\*/g, "$1")
  .replace(/\*(.+?)\*/g, "$1")
  .replace(/\[(.+?)\]\(.+?\)/g, "$1")
  .replace(/`(.+?)`/g, "$1")
  .trim()
  return title || fallback
}

/** 获取单个项目详情 */
export async function getProject(id: string): Promise<{ meta: ProjectMeta; files: { filename: string; title: string; lastModified: number }[] } | null> {
  const metaContent = await readFile(`projects/${id}/meta.json`)
  if (!metaContent) return null

  try {
    const meta = JSON.parse(metaContent) as ProjectMeta

    const projectPrefix = `projects/${id}/`
    const allFiles = await listFiles(projectPrefix, true)
    const fileList = allFiles
      .filter((f) => !f.pathname.endsWith("/meta.json"))
      .filter((f) => !f.pathname.endsWith("/chat-history.json"))
      // .audio/ 目录存放 TTS 生成的播客音频等内部资源，不是笔记文档，
      // 不应出现在文件浏览器中（音频通过聊天消息内的播放器访问）
      .filter((f) => !f.pathname.slice(projectPrefix.length).startsWith(".audio/"))

    const files = await Promise.all(
      fileList.map(async (f) => {
        const filename = f.pathname.slice(projectPrefix.length)
        const isText = /\.(md|txt|json|ya?ml|csv|tsv|xml|html?|js|ts|jsx|tsx|css|py|go|java|rs|sh|toml|ini|env|log)$/i.test(filename)
        let content: string | null = null
        if (isText) {
          content = await readFile(f.pathname)
        }
        return {
          filename,
          title: extractTitleFromContent(content, filename.split("/").pop() || filename),
          lastModified: f.lastModified || Date.now(),
        }
      })
    )

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
  const safeFilename = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._\-/]/g, "_")
  let finalFilename = safeFilename

  const exists = await fileExists(`projects/${projectId}/${safeFilename}`)
  if (exists) {
    const ext = path.extname(safeFilename)
    const base = path.basename(safeFilename, ext)
    finalFilename = `${base}_${Date.now()}${ext}`
  }

  const pathname = `projects/${projectId}/${finalFilename}`
  await writeFile(pathname, file, { contentType: file.type || undefined })

  let fileContent: string | null = null
  try {
    fileContent = await file.text()
  } catch {
    // 二进制文件无法读取文本
  }

  return {
    success: true,
    filename: finalFilename,
    title: extractTitleFromContent(fileContent, finalFilename),
  }
}

// ============================================================
// 辅助函数
// ============================================================

/** 判断 OSS 错误是否为 404 (NoSuchKey) */
function isOSSNotFound(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { status?: number; code?: string; name?: string }
    return e.status === 404 || e.code === "NoSuchKey" || e.name === "NoSuchKeyError"
  }
  return false
}

/** 生成 OSS 对象的公共访问 URL */
function getOSSUrl(pathname: string): string {
  const bucket = process.env.OSS_BUCKET || "my-notes-fzc"
  const region = process.env.OSS_REGION || "oss-cn-beijing"
  return `https://${bucket}.${region}.aliyuncs.com/${encodeURIComponent(pathname).replace(/%2F/g, "/")}`
}

/**
 * Get file metadata (last modified time, size) without reading content.
 */
export async function getFileMeta(pathname: string): Promise<{ lastModified: number; size: number } | null> {
  if (USE_OSS) {
    try {
      const client = getOSSClient()
      const result = await client.head(pathname)
      const headers = result.res?.headers as Record<string, string | undefined> | undefined
      const lastModified = headers?.["last-modified"]
        ? new Date(headers["last-modified"]).getTime()
        : Date.now()
      return {
        lastModified,
        size: headers?.["content-length"] ? parseInt(headers["content-length"], 10) : 0,
      }
    } catch {
      return null
    }
  } else {
    const filePath = path.join(LOCAL_CONTENT_DIR, pathname)
    try {
      const stat = fs.statSync(filePath)
      return { lastModified: stat.mtime.getTime(), size: stat.size }
    } catch {
      return null
    }
  }
}
