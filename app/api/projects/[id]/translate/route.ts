import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile } from "@/lib/storage"
import { isValidProjectId, sanitizeFilename } from "@/lib/validation"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    // 校验 projectId 格式
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "无效的项目 ID" }, { status: 400 })
    }

    const { filename: rawFilename, apiKey, apiBase, model } = await request.json()

    if (!rawFilename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 })
    }

    // 过滤文件名中的危险字符
    const filename = sanitizeFilename(rawFilename)

    if (!apiKey || !apiBase) {
      return NextResponse.json(
        { error: "请先配置 AI 助手的 API Key" },
        { status: 400 }
      )
    }

    // Read the file content via storage layer (Blob in production, fs in dev)
    const filePath = `projects/${projectId}/${filename}`
    const content = await readFile(filePath)

    if (!content) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    if (!content.trim()) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 })
    }

    const translateModel = model || "gpt-4o-mini"
    // Strip trailing slashes to match chat API behavior
    const baseUrl = apiBase.replace(/\/+$/, "")

    // Use streaming to match the chat API — some providers only support
    // certain models in streaming mode.
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: translateModel,
        messages: [
          {
            role: "system",
            content:
              "You are a professional translator. Translate the following markdown content into Simplified Chinese (zh-Hans). Preserve all markdown formatting, code blocks, links, images, HTML tags, and frontmatter exactly as they are. Only translate human-readable text. If the content is already in Chinese, return it as-is. Output only the translated markdown, no explanations.",
          },
          {
            role: "user",
            content,
          },
        ],
        temperature: 0.3,
        max_tokens: 16384,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      console.error("Translation API error:", response.status, errText)

      // If model is not supported, try listing available models and retry
      if (response.status === 400) {
        try {
          const modelsRes = await fetch(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json()
            const availableModel = modelsData?.data?.[0]?.id
            if (availableModel && availableModel !== translateModel) {
              const retryRes = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: availableModel,
                  messages: [
                    {
                      role: "system",
                      content:
                        "You are a professional translator. Translate the following markdown content into Simplified Chinese (zh-Hans). Preserve all markdown formatting, code blocks, links, images, HTML tags, and frontmatter exactly as they are. Only translate human-readable text. If the content is already in Chinese, return it as-is. Output only the translated markdown, no explanations.",
                    },
                    { role: "user", content },
                  ],
                  temperature: 0.3,
                  max_tokens: 16384,
                  stream: true,
                }),
              })

              if (retryRes.ok && retryRes.body) {
                const translatedContent = await readSSEStream(retryRes.body)
                if (translatedContent) {
                  await writeFile(filePath, translatedContent, { contentType: "text/markdown" })
                  return NextResponse.json({
                    success: true,
                    content: translatedContent,
                  })
                }
              }
            }
          }
        } catch {
          // ignore fallback errors
        }
      }

      return NextResponse.json(
        { error: `翻译服务返回错误 (${response.status})` },
        { status: 502 }
      )
    }

    // Read streaming response
    if (!response.body) {
      return NextResponse.json(
        { error: "翻译服务返回空响应" },
        { status: 502 }
      )
    }
    const translatedContent = await readSSEStream(response.body)

    if (!translatedContent) {
      return NextResponse.json(
        { error: "翻译返回空内容" },
        { status: 500 }
      )
    }

    // Save translated content back to the file via storage layer
    await writeFile(filePath, translatedContent, { contentType: "text/markdown" })

    return NextResponse.json({
      success: true,
      content: translatedContent,
    })
  } catch (error) {
    console.error("Translation error:", error)
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    )
  }
}

/** Read an SSE streaming chat completion response and concatenate the text. */
async function readSSEStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let fullContent = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith("data:")) continue
      const data = trimmed.slice(5).trim()
      if (data === "[DONE]") continue
      try {
        const json = JSON.parse(data)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) fullContent += delta
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }

  return fullContent
}
