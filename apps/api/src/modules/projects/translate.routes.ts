import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { readFile, writeFile } from "../../lib/storage.js"
import { isValidProjectId, isSafeExternalUrl, sanitizeFilename } from "../../lib/validation.js"

interface TranslateBody {
  filename?: string
  apiKey?: string
  apiBase?: string
  model?: string
}

/** 读取 SSE 流式 chat completion 响应并拼接文本 */
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

export default async function translateRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: TranslateBody }>(
    "/projects/:id/translate",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const { id: projectId } = request.params
        if (!isValidProjectId(projectId)) {
          return reply.code(400).send({ error: "无效的项目 ID" })
        }

        const { userId } = getAuthContext(request)
        const project = await requireProject(request, reply, projectId)
        if (!project) return

        const { filename: rawFilename, apiKey, apiBase, model } = request.body

        if (!rawFilename) {
          return reply.code(400).send({ error: "Missing filename" })
        }

        const filename = sanitizeFilename(rawFilename)

        if (!apiKey || !apiBase) {
          return reply.code(400).send({ error: "请先配置 AI 助手的 API Key" })
        }

        // SSRF 防护：拒绝指向内网地址的 apiBase（原 Next.js 版本缺失此项校验，
        // 迁移时一并补齐，因为 apiBase 是用户可控输入，攻击者可借此探测内网服务）
        if (!isSafeExternalUrl(apiBase)) {
          return reply.code(400).send({ error: "不允许访问内部网络地址" })
        }

        const filePath = `users/${userId}/projects/${projectId}/${filename}`
        const content = await readFile(filePath)

        if (!content) {
          return reply.code(404).send({ error: "文件不存在" })
        }

        if (!content.trim()) {
          return reply.code(400).send({ error: "File is empty" })
        }

        const translateModel = model || "gpt-4o-mini"
        const baseUrl = apiBase.replace(/\/+$/, "")

        const systemPrompt =
          "You are a professional translator. Translate the following markdown content into Simplified Chinese (zh-Hans). Preserve all markdown formatting, code blocks, links, images, HTML tags, and frontmatter exactly as they are. Only translate human-readable text. If the content is already in Chinese, return it as-is. Output only the translated markdown, no explanations."

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: translateModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content },
            ],
            temperature: 0.3,
            max_tokens: 16384,
            stream: true,
          }),
        })

        if (!response.ok) {
          const errText = await response.text().catch(() => "")
          fastify.log.error({ status: response.status, errText }, "Translation API error")

          // 模型不受支持时，尝试列出可用模型并重试一次
          if (response.status === 400) {
            try {
              const modelsRes = await fetch(`${baseUrl}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
              })
              if (modelsRes.ok) {
                const modelsData = (await modelsRes.json()) as { data?: { id?: string }[] }
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
                        { role: "system", content: systemPrompt },
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
                      return { success: true, content: translatedContent }
                    }
                  }
                }
              }
            } catch {
              // ignore fallback errors
            }
          }

          return reply.code(502).send({ error: `翻译服务返回错误 (${response.status})` })
        }

        if (!response.body) {
          return reply.code(502).send({ error: "翻译服务返回空响应" })
        }
        const translatedContent = await readSSEStream(response.body)

        if (!translatedContent) {
          return reply.code(500).send({ error: "翻译返回空内容" })
        }

        await writeFile(filePath, translatedContent, { contentType: "text/markdown" })

        return { success: true, content: translatedContent }
      } catch (err) {
        fastify.log.error(err, "Translation error")
        return reply.code(500).send({ error: "Translation failed" })
      }
    }
  )
}
