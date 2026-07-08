/**
 * PPT 下载 API — 服务端打包 ZIP 或 PDF
 * 对应原 Next.js 的 app/api/projects/[id]/download/route.ts
 *
 * POST /projects/:id/download
 * body: { format: "zip" | "pdf", title: string, images: string[] }
 * → 返回二进制流 (application/zip 或 application/pdf)
 *
 * 迁移说明：新增项目归属校验（原实现未校验项目是否存在/归属，
 * 这里补齐 requireProject 检查，与其余项目下路由保持一致的安全基线）。
 */

import type { FastifyInstance } from "fastify"
import { requireProject } from "../../lib/auth-context.js"
import { isSafeExternalUrl, isValidProjectId } from "../../lib/validation.js"

interface FetchedImage {
  buffer: Buffer
  mime: string // "image/png" | "image/jpeg" | ...
  ext: string // "png" | "jpg"
}

interface DownloadBody {
  format?: "zip" | "pdf"
  title?: string
  images?: string[]
}

type Params = { id: string }

export default async function downloadRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: Params; Body: DownloadBody }>(
    "/projects/:id/download",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const project = await requireProject(request, reply, id)
      if (!project) return

      try {
        const { format, title, images } = request.body ?? {}

        if (!images || !Array.isArray(images) || images.length === 0) {
          return reply.code(400).send({ error: "没有可下载的图片" })
        }

        // 服务端并行拉取所有图片（避免 CORS 问题）
        const fetchResults = await Promise.allSettled(
          images.map(async (url: string): Promise<FetchedImage | null> => {
            if (url.startsWith("data:")) {
              const header = url.split(",")[0]
              const mime = header.match(/data:(image\/\w+)/)?.[1] || "image/png"
              const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png"
              const base64 = url.split(",")[1]
              return { buffer: Buffer.from(base64, "base64"), mime, ext }
            }
            if (!isSafeExternalUrl(url)) {
              fastify.log.warn({ url }, "Blocked SSRF attempt in download route")
              return null
            }
            const res = await fetch(url)
            if (!res.ok) {
              fastify.log.error({ url, status: res.status }, "Failed to fetch image")
              return null
            }
            const buf = Buffer.from(await res.arrayBuffer())
            const mime = res.headers.get("content-type") || detectMime(buf)
            const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png"
            return { buffer: buf, mime, ext }
          })
        )
        const fetched: FetchedImage[] = fetchResults
          .filter((r): r is PromiseFulfilledResult<FetchedImage | null> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value!)

        if (fetched.length === 0) {
          return reply.code(500).send({ error: "图片获取失败" })
        }

        const safeTitle = (title || "presentation").replace(/[\\/:*?"<>|]/g, "_")

        if (format === "zip") {
          const JSZip = (await import("jszip")).default
          const zip = new JSZip()
          fetched.forEach((img, i) => {
            zip.file(`${safeTitle}-slide-${i + 1}.${img.ext}`, img.buffer)
          })
          const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })

          reply.header("Content-Type", "application/zip")
          reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(safeTitle)}.zip"`)
          return reply.send(zipBuffer)
        } else {
          // PDF — 服务端使用 jsPDF
          const { jsPDF } = await import("jspdf")

          const firstDims = getImageDimensions(fetched[0].buffer, fetched[0].mime)
          const width = firstDims.width
          const height = firstDims.height
          const orientation = width >= height ? "landscape" : "portrait"
          const pdf = new jsPDF({ orientation, unit: "px", format: [width, height] })

          fetched.forEach((img, i) => {
            if (i > 0) pdf.addPage([width, height], orientation)
            const base64 = img.buffer.toString("base64")
            const imgFormat = img.mime === "image/jpeg" ? "JPEG" : "PNG"
            pdf.addImage(`data:${img.mime};base64,${base64}`, imgFormat, 0, 0, width, height)
          })

          const pdfBuffer = Buffer.from(pdf.output("arraybuffer"))

          reply.header("Content-Type", "application/pdf")
          reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(safeTitle)}.pdf"`)
          return reply.send(pdfBuffer)
        }
      } catch (err) {
        fastify.log.error(err, "POST /projects/:id/download error")
        return reply.code(500).send({ error: "下载处理失败" })
      }
    }
  )
}

/** 通过魔数字节检测 MIME 类型 */
function detectMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png"
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg"
  }
  if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return "image/webp"
  }
  return "image/png"
}

/** 从 buffer 中获取图片尺寸 */
function getImageDimensions(buf: Buffer, mime: string): { width: number; height: number } {
  if (mime === "image/png") {
    // PNG: width 在字节 16-19, height 在字节 20-23 (big-endian)
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (mime === "image/jpeg") {
    return getJpegDimensions(buf)
  }
  // 兜底：尝试按 PNG 头解析
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** 解析 JPEG SOF marker 获取尺寸 */
function getJpegDimensions(buf: Buffer): { width: number; height: number } {
  let offset = 2 // 跳过 JPEG SOI marker (0xFF 0xD8)
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    // SOF0 (0xC0) 至 SOF15 (0xCF)，排除 SOF4 (0xC4) 和 SOF8 (0xC8)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
      const height = buf.readUInt16BE(offset + 5)
      const width = buf.readUInt16BE(offset + 7)
      return { width, height }
    }
    const segLen = buf.readUInt16BE(offset + 2)
    offset += 2 + segLen
  }
  // 兜底 — 1920x1080 横版
  return { width: 1920, height: 1080 }
}
