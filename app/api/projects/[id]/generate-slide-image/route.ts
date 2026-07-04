/**
 * Slide 图片生成 API
 *
 * POST /api/projects/[id]/generate-slide-image
 *   接收单页 slide 数据，调用生图 API 生成幻灯片图片
 *   返回 JSON: { url: string, index: number }
 */

import { NextRequest } from "next/server"
import { isValidProjectId, invalidProjectIdResponse } from "@/lib/validation"

export const maxDuration = 300

type RouteContext = { params: Promise<{ id: string }> }

interface SlideData {
  title: string
  bulletPoints: string[]
  layout: string
  imageHint: string
  speakerNote: string
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: projectId } = await context.params

  if (!isValidProjectId(projectId)) {
    return invalidProjectIdResponse()
  }

  const body = await request.json()
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
  } = body

  if (!projectId) {
    return Response.json({ error: "缺少项目 ID" }, { status: 400 })
  }
  if (!imageApiKey) {
    return Response.json({ error: "未配置生图 API Key，请在设置中配置。" }, { status: 400 })
  }

  const slideData = slide as SlideData
  if (!slideData?.title) {
    return Response.json({ error: "缺少 slide 数据" }, { status: 400 })
  }

  // 直接使用用户填入的完整 API 地址，不做任何拼接
  const url = (imageApiBase || "https://www.hfsyapi.cn/v1/images/generations").replace(/\/+$/, "")
  const model = imageModel || "gpt-image-2pro"
  const imageSize = size || "1792x1024"

  // 构建 image prompt
  const layoutDesc: Record<string, string> = {
    cover: "Hero cover slide: title text is the dominant visual centerpiece, occupying 60% of the composition. A subtle decorative illustration or abstract shape sits behind or beside the title. Include a thin subtitle line below.",
    content: "Content slide: clear visual hierarchy with a bold heading at top-left, 3-5 concise bullet points arranged with comfortable spacing in the main area, and a small complementary icon or illustration in the right margin.",
    section: "Section divider slide: a single bold section title centered both vertically and horizontally. Large-scale decorative background element (geometric shape, gradient mesh, or pattern) fills the canvas behind the text.",
    closing: "Closing slide: centered 'Thank You' or summary message with balanced whitespace. Optional subtle decorative border or bottom accent bar. Clean and memorable.",
  }

  const layoutText = layoutDesc[slideData.layout] || layoutDesc.content

  const bulletText = slideData.bulletPoints
    .map((bp) => `• ${bp}`)
    .join("\n")

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

Page ${slideIndex + 1} of ${totalSlides}.`

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
        const errJson = JSON.parse(errText)
        errMsg = errJson?.error?.message || errMsg
      } catch {
        if (errText.length < 200) errMsg = errText
      }
      return Response.json({ error: errMsg }, { status: response.status })
    }

    const data = await response.json()

    // 兼容不同的返回格式：优先使用 url，其次 b64_json
    const rawUrl = data?.data?.[0]?.url
    const b64 = data?.data?.[0]?.b64_json
    const imageUrl = rawUrl || (b64 ? `data:image/png;base64,${b64}` : null)

    if (!imageUrl) {
      return Response.json({ error: "生图 API 未返回图片 URL" }, { status: 500 })
    }

    return Response.json({ url: imageUrl, index: slideIndex })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误"
    return Response.json({ error: `生图请求异常: ${msg}` }, { status: 500 })
  }
}
