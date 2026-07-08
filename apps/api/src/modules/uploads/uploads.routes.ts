import path from "path"
import type { FastifyInstance } from "fastify"
import { getAuthContext } from "../../lib/auth-context.js"
import { deleteFile, fileExists, listFiles, readFile, writeFile } from "../../lib/storage.js"
import { sanitizeFilename } from "../../lib/validation.js"

/**
 * 独立上传文件（不属于任何项目）— 存储于 users/{userId}/uploads/{filename}
 *
 * GET    /uploads            列出当前用户的所有独立上传文件
 * GET    /uploads/:filename  读取单个文件内容
 * DELETE /uploads/:filename  删除单个文件
 * POST   /upload              上传新文件（multipart/form-data）
 */
export default async function uploadsRoutes(fastify: FastifyInstance) {
  fastify.get("/uploads", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { userId } = getAuthContext(request)
    try {
      const allFiles = await listFiles(`users/${userId}/uploads/`)
      const files = allFiles
        .filter((f) => f.pathname.endsWith(".md"))
        .map((f) => {
          const filename = f.pathname.split("/").pop() ?? ""
          return { filename, title: filename.replace(/\.md$/, "") }
        })
      return { files }
    } catch (err) {
      fastify.log.error(err, "GET /uploads error")
      return reply.send({ files: [] })
    }
  })

  fastify.get<{ Params: { filename: string } }>(
    "/uploads/:filename",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { userId } = getAuthContext(request)
      const decodedFilename = decodeURIComponent(request.params.filename)

      if (decodedFilename.includes("..") || decodedFilename.includes("/") || decodedFilename.includes("\\")) {
        return reply.code(400).send({ error: "非法文件名" })
      }
      const safeFilename = sanitizeFilename(decodedFilename)
      const pathname = `users/${userId}/uploads/${safeFilename}`

      try {
        const content = await readFile(pathname)
        if (content === null) {
          return reply.code(404).send({ error: "文件不存在" })
        }
        return { filename: safeFilename, title: safeFilename.replace(/\.md$/, ""), content }
      } catch (err) {
        fastify.log.error(err, "GET /uploads/:filename error")
        return reply.code(500).send({ error: "读取失败" })
      }
    }
  )

  fastify.delete<{ Params: { filename: string } }>(
    "/uploads/:filename",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { userId } = getAuthContext(request)
      const decodedFilename = decodeURIComponent(request.params.filename)

      if (decodedFilename.includes("..") || decodedFilename.includes("/") || decodedFilename.includes("\\")) {
        return reply.code(400).send({ error: "非法文件名" })
      }
      const safeFilename = sanitizeFilename(decodedFilename)
      const pathname = `users/${userId}/uploads/${safeFilename}`

      const exists = await fileExists(pathname)
      if (!exists) {
        return reply.code(404).send({ error: "文件不存在" })
      }

      try {
        await deleteFile(pathname)
        return { success: true }
      } catch (err) {
        fastify.log.error(err, "DELETE /uploads/:filename error")
        return reply.code(500).send({ error: "删除失败" })
      }
    }
  )

  fastify.post("/upload", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { userId } = getAuthContext(request)

    try {
      const file = await request.file()
      if (!file) {
        return reply.code(400).send({ error: "未选择文件" })
      }

      if (!file.filename.endsWith(".md")) {
        return reply.code(400).send({ error: "仅支持 .md 格式的 Markdown 文件" })
      }

      // 全局 multipart 插件已配置 fileSize 限制（10MB，见 app.ts）。
      // 超出限制时 toBuffer() 会抛出 FilesLimitError，下方单独捕获返回 413
      let buffer: Buffer
      try {
        buffer = await file.toBuffer()
      } catch {
        return reply.code(413).send({ error: "文件大小不能超过 10MB" })
      }

      const safeFilename = file.filename.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_")
      let finalFilename = safeFilename

      const exists = await fileExists(`users/${userId}/uploads/${safeFilename}`)
      if (exists) {
        const ext = path.extname(safeFilename)
        const base = path.basename(safeFilename, ext)
        finalFilename = `${base}_${Date.now()}${ext}`
      }

      const content = buffer.toString("utf-8")
      await writeFile(`users/${userId}/uploads/${finalFilename}`, content, {
        contentType: "text/markdown",
      })

      return {
        success: true,
        filename: finalFilename,
        title: finalFilename.replace(/\.md$/, ""),
      }
    } catch (err) {
      fastify.log.error(err, "Upload error")
      return reply.code(500).send({ error: "上传失败" })
    }
  })
}
