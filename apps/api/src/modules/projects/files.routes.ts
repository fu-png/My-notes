/**
 * 项目内文件 CRUD API — 对应原 Next.js 的
 * app/api/projects/[id]/files/[[...pathname]]/route.ts
 *
 * POST   /projects/:id/files/*   上传文件（支持批量，multipart/form-data）
 * GET    /projects/:id/files/*   读取文件内容
 * PUT    /projects/:id/files/*   更新文件内容
 * PATCH  /projects/:id/files/*   重命名文件
 * DELETE /projects/:id/files/*   删除文件
 *
 * 迁移说明：Next.js 的可选 catch-all 路由 [[...pathname]] 用 Fastify 的
 * 通配符路由 "/projects/:id/files/*" 平移，通配部分通过 `request.params["*"]`
 * 取得（Fastify 内置行为）。存储路径统一改为 users/{userId}/projects/{id}/...，
 * 归属校验复用 requireProject。
 */

import path from "path"
import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import {
  deleteFile,
  fileExists,
  getFileMeta,
  readFile,
  renameFile,
  uploadFileToProject,
  userProjectPrefix,
  writeFile,
} from "../../lib/storage.js"
import { isValidProjectId, sanitizeFilename } from "../../lib/validation.js"

// 支持上传的文件扩展名
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

// 二进制/非文本资源扩展名 — 不应作为文本内容读取，避免二进制数据被塞进 JSON 响应
const BINARY_EXTENSIONS = [
  ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".mp4", ".mov", ".webm",
]

function isBinaryFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return BINARY_EXTENSIONS.includes(ext)
}

type Params = { id: string; "*": string }

export default async function filesRoutes(fastify: FastifyInstance) {
  // POST /projects/:id/files/* — 上传文件（支持批量）
  fastify.post<{ Params: Params }>(
    "/projects/:id/files/*",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, id)
      if (!project) return

      try {
        const parts = request.files()
        const results: { success: boolean; filename: string; title: string; error?: string }[] = []

        for await (const part of parts) {
          let buffer: Buffer
          try {
            buffer = await part.toBuffer()
          } catch {
            results.push({
              success: false,
              filename: part.filename,
              title: part.filename,
              error: "文件大小不能超过 10MB",
            })
            continue
          }

          if (!isSupportedFile(part.filename)) {
            results.push({
              success: false,
              filename: part.filename,
              title: part.filename,
              error: "不支持的文件格式",
            })
            continue
          }

          // uploadFileToProject 需要一个 File-like 对象（name/type/text()/arrayBuffer()）
          const file = bufferToFile(buffer, part.filename, part.mimetype)
          const result = await uploadFileToProject(userId, id, file)
          results.push(result)
        }

        if (results.length === 0) {
          return reply.code(400).send({ error: "未选择文件" })
        }

        const successCount = results.filter((r) => r.success).length
        const failCount = results.filter((r) => !r.success).length

        return {
          success: successCount > 0,
          results,
          summary: { total: results.length, success: successCount, failed: failCount },
          // 兼容单文件上传时的旧字段
          ...(results.length === 1 && results[0].success
            ? { filename: results[0].filename, title: results[0].title }
            : {}),
        }
      } catch (err) {
        fastify.log.error(err, "POST /projects/:id/files upload error")
        return reply.code(500).send({ error: "上传失败" })
      }
    }
  )

  // GET /projects/:id/files/* — 读取文件内容
  fastify.get<{ Params: Params }>(
    "/projects/:id/files/*",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      const decodedPathname = request.params["*"] || ""

      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }
      if (decodedPathname.includes("..")) {
        return reply.code(400).send({ error: "非法的文件路径" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, id)
      if (!project) return

      if (isBinaryFile(decodedPathname)) {
        return reply.code(415).send({ error: "该文件为二进制资源，不支持文本预览", isBinary: true })
      }

      const pathname = `${userProjectPrefix(userId, id)}${decodedPathname}`

      try {
        const [content, meta] = await Promise.all([readFile(pathname), getFileMeta(pathname)])
        if (content === null) {
          return reply.code(404).send({ error: "文件不存在" })
        }

        reply.header("Cache-Control", "private, max-age=60, stale-while-revalidate=300")
        return {
          filename: decodedPathname,
          title: decodedPathname.split("/").pop()?.replace(/\.[^.]+$/, "") || decodedPathname,
          content,
          lastModified: meta?.lastModified || Date.now(),
        }
      } catch (err) {
        fastify.log.error(err, "GET /projects/:id/files error")
        return reply.code(500).send({ error: "读取失败" })
      }
    }
  )

  // PUT /projects/:id/files/* — 更新文件内容
  fastify.put<{ Params: Params; Body: { content?: string } }>(
    "/projects/:id/files/*",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      const decodedPathname = request.params["*"] || ""

      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }
      if (decodedPathname.includes("..")) {
        return reply.code(400).send({ error: "非法的文件路径" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, id)
      if (!project) return

      const content = request.body?.content
      if (content === undefined || content === null) {
        return reply.code(400).send({ error: "缺少 content 字段" })
      }

      const pathname = `${userProjectPrefix(userId, id)}${decodedPathname}`

      try {
        const exists = await fileExists(pathname)
        if (!exists) {
          return reply.code(404).send({ error: "文件不存在" })
        }

        await writeFile(pathname, content, { contentType: "text/markdown; charset=utf-8" })
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "保存失败"
        fastify.log.error(err, "PUT /projects/:id/files error")
        return reply.code(500).send({ error: msg })
      }
    }
  )

  // PATCH /projects/:id/files/* — 重命名文件
  fastify.patch<{ Params: Params; Body: { newFilename?: string } }>(
    "/projects/:id/files/*",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      const decodedPathname = request.params["*"] || ""

      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }
      if (decodedPathname.includes("..")) {
        return reply.code(400).send({ error: "非法的文件路径" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, id)
      if (!project) return

      const newFilename = request.body?.newFilename
      if (!newFilename || typeof newFilename !== "string" || !newFilename.trim()) {
        return reply.code(400).send({ error: "新文件名不能为空" })
      }

      const prefix = userProjectPrefix(userId, id)
      const oldPathname = `${prefix}${decodedPathname}`
      const trimmed = sanitizeFilename(newFilename)
      const newPathname = `${prefix}${trimmed}`

      if (oldPathname === newPathname) {
        return { success: true, filename: trimmed }
      }

      try {
        const success = await renameFile(oldPathname, newPathname)
        if (!success) {
          const oldExists = await fileExists(oldPathname)
          if (!oldExists) {
            return reply.code(404).send({ error: "原文件不存在" })
          }
          return reply.code(409).send({ error: "重命名失败，目标文件名可能已存在" })
        }
        return { success: true, filename: trimmed }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "重命名失败"
        fastify.log.error(err, "PATCH /projects/:id/files error")
        return reply.code(500).send({ error: msg })
      }
    }
  )

  // DELETE /projects/:id/files/* — 删除文件
  fastify.delete<{ Params: Params }>(
    "/projects/:id/files/*",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      const decodedPathname = request.params["*"] || ""

      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }
      if (decodedPathname.includes("..")) {
        return reply.code(400).send({ error: "非法的文件路径" })
      }

      const { userId } = getAuthContext(request)
      const project = await requireProject(request, reply, id)
      if (!project) return

      const pathname = `${userProjectPrefix(userId, id)}${decodedPathname}`

      const exists = await fileExists(pathname)
      if (!exists) {
        return reply.code(404).send({ error: "文件不存在" })
      }

      try {
        const success = await deleteFile(pathname)
        if (!success) {
          return reply.code(500).send({ error: "删除失败，文件可能在存储中未找到" })
        }
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "删除失败"
        fastify.log.error(err, "DELETE /projects/:id/files error")
        return reply.code(500).send({ error: msg })
      }
    }
  )
}

/** 将 Buffer 包装为最小可用的 File-like 对象，供 uploadFileToProject 复用 */
function bufferToFile(buffer: Buffer, filename: string, mimetype: string): File {
  return new File([buffer], filename, { type: mimetype || "application/octet-stream" })
}
