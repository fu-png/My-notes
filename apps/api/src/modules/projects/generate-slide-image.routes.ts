/**
 * Slide 图片生成 API — 对应原 Next.js 的
 * app/api/projects/[id]/generate-slide-image/route.ts
 *
 * POST /projects/:id/generate-slide-image
 *   接收单页 slide 数据，调用生图 API 生成幻灯片图片
 *   返回 JSON: { url: string, index: number }
 *
 * 迁移说明：新增项目归属校验（原实现仅校验 projectId 格式，未校验项目是否存在/归属）。
 */

import type { FastifyInstance } from "fastify"
import { requireProject } from "../../lib/auth-context.js"
import { isValidProjectId } from "../../lib/validation.js"

interface SlideData {
  title: string
  bulletPoints: string[]
  layout: string
  imageHint: string
  speakerNote: string
}

interface GenerateSlideImageBody {
  imageApiKey?: string
  imageApiBase?: string
  imageModel?: string
  slide?: SlideData
  styleDescription?: string
  styleColors?: string
  customPrompt?: string
  size?: string
  slideIndex?: number
  totalSlides?: number
}

type Params = { id: string }

export default async function generateSlideImageRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: Params; Body: GenerateSlideImageBody }>(
    "/projects/:id/generate-slide-image",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id: projectId } = request.params
      if (!isValidProjectId(projectId)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const project = await requireProject(request, reply, projectId)
      if (!project) return

      const {
        imageApiKey,
        imageApiBase,
        imageModel,
        slide,
        styleDescription,
        styleColors,
        customPrompt,
        size,
        slideIndex,
        totalSlides,
      } = request.body ?? {}

      if (!imageApiKey) {
        return reply.code(400).send({ error: "未配置生图 API Key，请在设置中配置。" })
      }

      const slideData = slide
      if (!slideData?.title) {
        return reply.code(400).send({ error: "缺少 slide 数据" })
      }

      // 直接使用用户填入的完整 API 地址，不做任何拼接
      const url = (imageApiBase || "https://www.hfsyapi.cn/v1/images/generations").replace(/\/+$/, "")
      const model = imageModel || "gpt-image-2pro"
      const imageSize = size || "1792x1024"

      const layoutDesc: Record<string, string> = {
        cover: "Hero cover slide: title text is the dominant visual centerpiece, occupying 60% of the composition. A subtle decorative illustration or abstract shape sits behind or beside the title. Include a thin subtitle line below.",
        content: "Content slide: clear visual hierarchy with a bold heading at top-left, 3-5 concise bullet points arranged with comfortable spacing in the main area, and a small complementary icon or illustration in the right margin.",
        section: "Section divider slide: a single bold section title centered both vertically and horizontally. Large-scale decorative background element (geometric shape, gradient mesh, or pattern) fills the canvas behind the text.",
        closing: "Closing slide: centered 'Thank You' or summary message with balanced whitespace. Optional subtle decorative border or bottom accent bar. Clean and memorable.",
      }

      const layoutText = layoutDesc[slideData.layout] || layoutDesc.content

      const bulletText = slideData.bulletPoints.map((bp) => `• ${bp}`).join("\n")

      let prompt = `Create a stunning, print-quality presentation slide.

VISUAL DESIGN: ${styleDescription || "Premium modern corporate keynote style with clean geometric layout and subtle gradient accents."}
COLOR PALETTE: ${styleColors || "#1B3A5C navy, #FFFFFF white, #F0F4F8 soft gray, #3B82F6 blue accent"}
COMPOSITION: ${layoutText}
DIMENSIONS: Strictly 16:9 widescreen landscape ratio. Horizontal layout only.

CONTENT TO RENDER:
Headline: "${slideData.title}"${slideData.bulletPoints.length > 0 ? `\nBody text:\n${bulletText}` : ""}

VISUAL ENHANCEMENT: ${slideData.imageHint || "Abstract geometric decorative elements complementing the content"}

QUALITY REQUIREMENTS:
- This must look like a slide from a $500/deck professional design agency
- Perfect typographic hierarchy: headline 2-3x larger than body text
- All text must be razor-sharp and perfectly legible
- Balanced negative space — never feel crowded
- Decorative elements support the content, never compete with it
- Render ALL Chinese characters exactly as provided, using a premium sans-serif font (e.g., PingFang, Source Han Sans style)
- No watermarks, no artifacts, no placeholder text

Page ${(slideIndex ?? 0) + 1} of ${totalSlides ?? 1}.`

      if (customPrompt) {
        prompt += `\n\nADDITIONAL CREATIVE DIRECTION: ${customPrompt}`
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${imageApiKey}`,
          },
          body: JSON.stringify({
            model,
            prompt,
            n: 1,
            size: imageSize,
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          let errMsg = `生图 API 调用失败 (${response.status})`
          try {
            const errJson = JSON.parse(errText) as { error?: { message?: string } }
            errMsg = errJson?.error?.message || errMsg
          } catch {
            if (errText.length < 200) errMsg = errText
          }
          return reply.code(response.status).send({ error: errMsg })
        }

        const data = (await response.json()) as { data?: { url?: string; b64_json?: string }[] }

        // 兼容不同的返回格式：优先使用 url，其次 b64_json
        const rawUrl = data?.data?.[0]?.url
        const b64 = data?.data?.[0]?.b64_json
        const imageUrl = rawUrl || (b64 ? `data:image/png;base64,${b64}` : null)

        if (!imageUrl) {
          return reply.code(500).send({ error: "生图 API 未返回图片 URL" })
        }

        return { url: imageUrl, index: slideIndex }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "未知错误"
        return reply.code(500).send({ error: `生图请求异常: ${msg}` })
      }
    }
  )
}
