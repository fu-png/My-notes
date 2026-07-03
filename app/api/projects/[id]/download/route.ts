/**
 * PPT 下载 API — 服务端打包 ZIP 或 PDF
 *
 * POST /api/projects/:id/download
 * body: { format: "zip" | "pdf", title: string, images: string[] }
 * → Returns binary stream (application/zip or application/pdf)
 */

import { NextRequest, NextResponse } from "next/server"
import { isValidProjectId, invalidProjectIdResponse } from "@/lib/validation"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * 检查图片 URL 是否允许访问（SSRF 防护）
 * 拒绝内网地址和非 http/https 协议
 */
function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // 仅允许 http/https 协议
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false
    }
    const hostname = parsed.hostname
    // 拒绝 IPv4 私有/内网地址
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||          // 127.0.0.0/8
      hostname.startsWith("10.") ||           // 10.0.0.0/8
      hostname.startsWith("192.168.") ||       // 192.168.0.0/16
      hostname.startsWith("169.254.") ||       // 169.254.0.0/16 (link-local)
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) // 172.16.0.0/12
    ) {
      return false
    }
    // 拒绝 IPv6 回环地址
    if (hostname === "[::1]") {
      return false
    }
    // 拒绝 IPv6 私有地址（fc00::/7 范围）
    if (/^\[f[cd][0-9a-f]{2}:/.test(hostname)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

interface FetchedImage {
  buffer: Buffer
  mime: string // "image/png" | "image/jpeg" | ...
  ext: string  // "png" | "jpg"
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!isValidProjectId(id)) {
    return invalidProjectIdResponse()
  }

  try {
    const body = await request.json()
    const { format, title, images } = body as {
      format: "zip" | "pdf"
      title: string
      images: string[]
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "没有可下载的图片" }, { status: 400 })
    }

    // Fetch all images server-side (no CORS issues)
    const fetched: FetchedImage[] = []
    for (const url of images) {
      if (url.startsWith("data:")) {
        // base64 data URL — extract mime from header
        const header = url.split(",")[0]
        const mime = header.match(/data:(image\/\w+)/)?.[1] || "image/png"
        const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png"
        const base64 = url.split(",")[1]
        fetched.push({ buffer: Buffer.from(base64, "base64"), mime, ext })
      } else {
        // SSRF 防护：拒绝内网地址
        if (!isAllowedImageUrl(url)) {
          console.error('Blocked SSRF attempt:', url)
          continue
        }
        const res = await fetch(url)
        if (!res.ok) {
          console.error(`Failed to fetch image: ${url} — ${res.status}`)
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const mime = res.headers.get("content-type") || detectMime(buf)
        const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png"
        fetched.push({ buffer: buf, mime, ext })
      }
    }

    if (fetched.length === 0) {
      return NextResponse.json({ error: "图片获取失败" }, { status: 500 })
    }

    const safeTitle = (title || "presentation").replace(/[\\/:*?"<>|]/g, "_")

    if (format === "zip") {
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()
      fetched.forEach((img, i) => {
        zip.file(`${safeTitle}-slide-${i + 1}.${img.ext}`, img.buffer)
      })
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })
      const zipBytes = new Uint8Array(zipBuffer)

      return new NextResponse(zipBytes, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.zip"`,
        },
      })
    } else {
      // PDF — use jsPDF on server
      const { jsPDF } = await import("jspdf")

      // Get dimensions from first image
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
      const pdfBytes = new Uint8Array(pdfBuffer)

      return new NextResponse(pdfBytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.pdf"`,
        },
      })
    }
  } catch (error) {
    console.error("[download] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "下载失败" },
      { status: 500 }
    )
  }
}

/** Detect MIME type from magic bytes */
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

/** Get image dimensions from buffer */
function getImageDimensions(buf: Buffer, mime: string): { width: number; height: number } {
  if (mime === "image/png") {
    // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (mime === "image/jpeg") {
    return getJpegDimensions(buf)
  }
  // Fallback: try PNG header
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** Parse JPEG SOF marker to get dimensions */
function getJpegDimensions(buf: Buffer): { width: number; height: number } {
  let offset = 2 // Skip JPEG SOI marker (0xFF 0xD8)
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    // SOF0 (0xC0) through SOF15 (0xCF), excluding SOF4 (0xC4) and SOF8 (0xC8)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
      const height = buf.readUInt16BE(offset + 5)
      const width = buf.readUInt16BE(offset + 7)
      return { width, height }
    }
    // Skip to next marker — segment length is 2 bytes at offset+2
    const segLen = buf.readUInt16BE(offset + 2)
    offset += 2 + segLen
  }
  // Fallback — 1920x1080 landscape
  return { width: 1920, height: 1080 }
}
