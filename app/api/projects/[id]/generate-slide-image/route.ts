/**
 * Slide 图片生成 API
 *
 * POST /api/projects/[id]/generate-slide-image
 *   接收单页 slide 数据，调用生图 API 生成幻灯片图片
 *   返回 JSON: { url: string, index: number }
 */

import { NextRequest } from "next/server"

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

  const apiBase = (imageApiBase || "https://www.hfsyapi.cn").replace(/\/+$/, "")
  const model = imageModel || "gpt-image-2pro"
  const imageSize = size || "1536x1024"

  // 构建 image prompt
  const layoutDesc: Record<string, string> = {
    cover: "title/cover slide with large centered title text, subtitle area, and decorative visual",
    content: "content slide with title at top, bullet points list in body area, and supporting visual on the side",
    section: "section divider slide with large section title, minimal text, and bold visual element",
    closing: "closing/thank-you slide with summary text and call-to-action or contact info",
  }

  const layoutText = layoutDesc[slideData.layout] || layoutDesc.content

  const bulletText = slideData.bulletPoints
    .map((bp, i) => `${i + 1}. ${bp}`)
    .join("\n")

  let prompt = `A professional presentation slide, ${styleDescription || "modern corporate presentation style"}.
Layout: ${layoutText}
Slide dimensions: 16:9 widescreen ratio.

Title text (render this Chinese text prominently at the top): "${slideData.title}"
${slideData.bulletPoints.length > 0 ? `Bullet points (render this Chinese text as a clean readable list in the body):\n${bulletText}` : ""}

Visual style hint: ${slideData.imageHint || "abstract professional background"}
Color palette: ${styleColors || "navy blue, white, light gray"}
Typography: clean, modern, highly readable. Use appropriate font sizes for readability.
The slide should look like a real PowerPoint slide with proper text layout, not just an illustration.
IMPORTANT: Render all Chinese text EXACTLY as provided above. Do not paraphrase, transliterate, or omit any text. Every character must appear clearly and legibly in the final image. Use a clean sans-serif font that supports Chinese characters. Font size should be large enough for easy reading.
Slide ${slideIndex + 1} of ${totalSlides}.`

  if (customPrompt) {
    prompt += `\nAdditional requirements: ${customPrompt}`
  }

  try {
    const response = await fetch(`${apiBase}/v1/images/generations`, {
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

    // 兼容不同的返回格式
    const imageUrl =
      data?.data?.[0]?.url ||
      data?.data?.[0]?.b64_json
        ? `data:image/png;base64,${data.data[0].b64_json}`
        : null

    if (!imageUrl) {
      return Response.json({ error: "生图 API 未返回图片 URL" }, { status: 500 })
    }

    return Response.json({ url: imageUrl, index: slideIndex })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误"
    return Response.json({ error: `生图请求异常: ${msg}` }, { status: 500 })
  }
}
