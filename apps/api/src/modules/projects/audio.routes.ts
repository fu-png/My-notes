import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { SSEWriter } from "../../lib/sse.js"
import { listFiles, readFile, userProjectPrefix, writeFile } from "../../lib/storage.js"
import { isValidProjectId } from "../../lib/validation.js"

/**
 * 音频概述 API — Podcast 风格双人对话 TTS（流式）
 *
 * POST /projects/:id/audio
 *   action: "generate"  — 生成对话脚本 + TTS 合成音频
 *   action: "status"    — 检查是否已有音频缓存
 *   action: "script"    — 仅生成对话脚本（不合成 TTS）
 *
 * 迁移自 apps/web/app/api/projects/[id]/audio/route.ts，逻辑保持一致；
 * 存储路径改为按 userId 隔离的 users/{userId}/projects/{id}/ 前缀。
 */

interface DialogueLine {
  speaker: "host" | "expert"
  text: string
}

const AUDIO_CHUNK_PATH = (prefix: string, index: number) => `${prefix}.audio/chunk-${String(index).padStart(3, "0")}.mp3`
const AUDIO_MANIFEST_PATH = (prefix: string) => `${prefix}.audio/manifest.json`
const SCRIPT_PATH = (prefix: string) => `${prefix}.audio/script.json`

const DIALOGUE_PROMPT = `你是一个专业的播客脚本撰写人。请基于以下文档内容，生成一段信息密度高、引人入胜的双人对话脚本。

对话角色：
- Host（主持人）：负责引入话题、提出关键问题、做总结。语气亲切、好奇。
- Expert（专家）：负责深入解释概念、举例说明、分享洞察。语气专业但通俗易懂。

要求：
1. 对话应有 8-15 个回合（即 16-30 行台词）
2. 以 Host 开场，介绍今天讨论的话题
3. 涵盖文档中最重要的概念和亮点
4. 对话自然流畅，避免生硬地罗列信息
5. Expert 应该用比喻和例子让复杂概念更易理解
6. Host 在关键节点做简短总结，帮助听众跟上
7. 以 Host 做结束语收尾
8. 使用中文

**输出格式：** 严格输出 JSON 对象，包含一个 "dialogue" 字段，值为数组。数组每项包含 speaker ("host" 或 "expert") 和 text 字段。text 中如需使用双引号请用中文引号「」替代。不要添加任何其他文字、标记或注释。

示例输出格式：
{"dialogue": [
  {"speaker": "host", "text": "大家好！今天我们..."},
  {"speaker": "expert", "text": "确实是这样..."}
]}`

export default async function audioRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { id: string }
    Body: {
      action?: string
      apiKey?: string
      apiBase?: string
      model?: string
      ttsModel?: string
      voiceHost?: string
      voiceExpert?: string
      script?: DialogueLine[]
    }
  }>("/projects/:id/audio", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id: projectId } = request.params
    if (!isValidProjectId(projectId)) {
      return reply.code(400).send({ error: "无效的项目 ID" })
    }

    const project = await requireProject(request, reply, projectId)
    if (!project) return

    const { userId } = getAuthContext(request)
    const projectPrefix = userProjectPrefix(userId, projectId)

    const { action, apiKey, apiBase, model, ttsModel, voiceHost, voiceExpert, script: providedScript } =
      request.body ?? {}

    // ─── 状态查询：检查是否已有缓存音频 ───
    if (action === "status") {
      const manifestData = await readFile(AUDIO_MANIFEST_PATH(projectPrefix))
      const scriptData = await readFile(SCRIPT_PATH(projectPrefix))

      let manifest = null
      if (manifestData) {
        try {
          manifest = JSON.parse(manifestData)
        } catch {
          /* ignore */
        }
      }

      return {
        hasAudio: !!manifest,
        hasScript: !!scriptData,
        script: scriptData ? JSON.parse(scriptData) : null,
        manifest,
      }
    }

    // 以下操作都需要 API Key
    if (!apiKey) {
      return reply.code(400).send({ error: "需要 API Key" })
    }

    if (action !== "script" && action !== "generate") {
      return reply.code(400).send({ error: `未知操作: ${action}` })
    }

    // 如果客户端已提供脚本（action=generate），跳过文档读取
    let mdFiles: { pathname: string }[] = []
    let truncatedContent = ""
    const hasProvidedScript = Array.isArray(providedScript) && providedScript.length > 0

    if (!hasProvidedScript) {
      const allFiles = await listFiles(projectPrefix, true)
      mdFiles = allFiles.filter(
        (f) =>
          !f.pathname.endsWith("/meta.json") &&
          !f.pathname.includes("/.rag/") &&
          !f.pathname.includes("/.audio/") &&
          (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
      )

      if (mdFiles.length === 0) {
        return reply.code(400).send({ error: "项目中没有可用的文档" })
      }

      const documentEntries = await Promise.all(
        mdFiles.map(async (file) => {
          const content = await readFile(file.pathname)
          if (content && content.trim().length > 0) {
            const filename = file.pathname.slice(projectPrefix.length)
            return `--- 文档: ${filename} ---\n${content}`
          }
          return null
        })
      )
      const documents = documentEntries.filter((d): d is string => d !== null)

      const fullContent = documents.join("\n\n")
      const maxChars = 60000
      truncatedContent =
        fullContent.length > maxChars ? fullContent.slice(0, maxChars) + "\n\n[...内容已截断...]" : fullContent
    }

    const apiBaseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")
    const sse = new SSEWriter(reply)
    sse.start()

    try {
      let dialogue: DialogueLine[]

      if (hasProvidedScript) {
        sse.send({ step: "script_done", script: providedScript, lineCount: providedScript!.length })
        dialogue = providedScript!
          .filter((d) => d && typeof d.text === "string" && d.text.trim().length > 0)
          .map((d) => ({
            speaker: d.speaker === "expert" ? ("expert" as const) : ("host" as const),
            text: d.text.trim(),
          }))

        if (dialogue.length === 0) {
          sse.send({ error: "提供的脚本没有有效的对话行" })
          sse.done()
          return
        }
      } else {
        // Step 1: 生成对话脚本
        sse.send({ step: "script", progress: "正在生成对话脚本..." })

        const chatModel = model || "gpt-4o-mini"
        const messages = [
          { role: "system", content: DIALOGUE_PROMPT },
          {
            role: "user",
            content: `以下是项目文档内容（共 ${mdFiles.length} 个文件）：\n\n${truncatedContent}\n\n请直接输出 JSON 对象，格式为 {"dialogue": [...]}，不要包含任何其他文字。注意：text 字段中不要使用未转义的双引号，如需引用请用中文引号「」。`,
          },
        ]

        let scriptRes = await fetch(`${apiBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: chatModel,
            messages,
            temperature: 0.7,
            max_tokens: 4096,
            response_format: { type: "json_object" },
          }),
        })

        if (!scriptRes.ok && (scriptRes.status === 400 || scriptRes.status === 422)) {
          scriptRes = await fetch(`${apiBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: chatModel,
              messages,
              temperature: 0.7,
              max_tokens: 4096,
            }),
          })
        }

        if (!scriptRes.ok) {
          const err = await scriptRes.text()
          sse.send({ error: `脚本生成失败: ${scriptRes.status} ${err.slice(0, 200)}` })
          sse.done()
          return
        }

        const scriptData = (await scriptRes.json()) as {
          choices?: { message?: { content?: string } }[]
        }
        const rawContent = scriptData.choices?.[0]?.message?.content || ""

        try {
          let jsonStr = ""

          const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim()
          }

          if (!jsonStr) {
            const jsonMatch = rawContent.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              jsonStr = jsonMatch[0]
            }
          }

          if (!jsonStr) {
            jsonStr = rawContent.trim()
          }

          if (!jsonStr) throw new Error("未找到 JSON 内容")

          let parsed: unknown
          try {
            parsed = JSON.parse(jsonStr)
          } catch {
            jsonStr = jsonStr.replace(/^\uFEFF/, "").replace(/[\x00-\x1F\x7F]/g, (ch) => {
              if (ch === "\n" || ch === "\r" || ch === "\t") return ch
              return ""
            })

            jsonStr = jsonStr.replace(/("text"\s*:\s*")([\s\S]*?)("(?:\s*[,}\]]))/g, (_, prefix, content, suffix) => {
              const escaped = content
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t")
              return prefix + escaped + suffix
            })

            try {
              parsed = JSON.parse(jsonStr)
            } catch {
              const items: DialogueLine[] = []
              const lineRegex = /\{\s*"speaker"\s*:\s*"(host|expert)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g
              let match
              while ((match = lineRegex.exec(rawContent)) !== null) {
                items.push({
                  speaker: match[1] as "host" | "expert",
                  text: match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
                })
              }
              if (items.length === 0) {
                const altRegex = /\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"speaker"\s*:\s*"(host|expert)"\s*\}/g
                while ((match = altRegex.exec(rawContent)) !== null) {
                  items.push({
                    speaker: match[2] as "host" | "expert",
                    text: match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
                  })
                }
              }
              if (items.length > 0) {
                parsed = items
              } else {
                throw new Error("所有 JSON 修复方法均失败")
              }
            }
          }

          const dialogueArray = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).dialogue)
              ? ((parsed as Record<string, unknown>).dialogue as unknown[])
              : []
          dialogue = dialogueArray as DialogueLine[]

          dialogue = dialogue
            .filter((d) => d && typeof d.text === "string" && d.text.trim().length > 0)
            .map((d) => ({
              speaker: d.speaker === "expert" ? ("expert" as const) : ("host" as const),
              text: d.text.trim(),
            }))

          if (dialogue.length === 0) {
            throw new Error("解析后没有有效的对话行")
          }
        } catch (parseError: unknown) {
          const parseMsg = parseError instanceof Error ? parseError.message : "未知解析错误"
          fastify.log.error(
            { parseMsg, rawContentPreview: rawContent.slice(0, 500) },
            "[Audio] JSON parse error"
          )
          sse.send({ error: `对话脚本格式解析失败: ${parseMsg}，请重试` })
          sse.done()
          return
        }

        await writeFile(SCRIPT_PATH(projectPrefix), JSON.stringify(dialogue, null, 2), {
          contentType: "application/json",
        })

        sse.send({ step: "script_done", script: dialogue, lineCount: dialogue.length })

        if (action === "script") {
          sse.send({ done: true, hasAudio: false })
          sse.done()
          return
        }
      }

      // Step 2: TTS 合成 — 逐段合成并上传（避免合并大文件跨区域上传超时）
      sse.send({ step: "tts", progress: "正在合成语音..." })

      const hostVoice = voiceHost || "冰糖"
      const expertVoice = voiceExpert || "苏打"
      const ttsModelName = ttsModel || "mimo-v2.5-tts"

      const CONCURRENCY = 10
      const results: (string | null)[] = new Array(dialogue.length).fill(null)
      let completedCount = 0

      const TTS_TIMEOUT_MS = 60000

      const synthesizeLine = async (i: number) => {
        const line = dialogue[i]
        try {
          const ttsRes = await fetch(`${apiBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: ttsModelName,
              messages: [
                {
                  role: "user",
                  content:
                    line.speaker === "host"
                      ? "用轻松自然的播客主持人语调，语速适中，声音清晰明亮"
                      : "用专业但亲切的专家语调，语速适中，表达清晰有信心",
                },
                {
                  role: "assistant",
                  content: line.text,
                },
              ],
              audio: {
                format: "mp3",
                voice: line.speaker === "host" ? hostVoice : expertVoice,
              },
            }),
            signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
          })

          if (!ttsRes.ok) {
            const errText = await ttsRes.text().catch(() => "")
            sse.send({
              step: "tts_progress",
              progress: `第 ${i + 1} 段合成失败 (${ttsRes.status})，跳过: ${errText.slice(0, 100)}`,
            })
            return
          }

          const ttsData = (await ttsRes.json()) as {
            choices?: { message?: { audio?: { data?: string } } }[]
          }
          const audioBase64 = ttsData.choices?.[0]?.message?.audio?.data
          if (!audioBase64) {
            sse.send({ step: "tts_progress", progress: `第 ${i + 1} 段未返回音频数据，跳过` })
            return
          }
          const audioBuffer = Buffer.from(audioBase64, "base64")

          const stored = await writeFile(AUDIO_CHUNK_PATH(projectPrefix, i), audioBuffer, {
            contentType: "audio/mpeg",
          })
          results[i] = stored.url.replace(/^http:\/\//, "https://")
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === "TimeoutError"
          sse.send({
            step: "tts_progress",
            progress: `第 ${i + 1} 段${isTimeout ? "合成超时" : "合成失败"}，跳过`,
          })
        } finally {
          completedCount++
          sse.send({
            step: "tts_progress",
            progress: `合成语音 (${completedCount}/${dialogue.length})...`,
            current: completedCount,
            total: dialogue.length,
          })
        }
      }

      let nextIndex = 0
      const worker = async () => {
        while (nextIndex < dialogue.length) {
          const current = nextIndex++
          await synthesizeLine(current)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, dialogue.length) }, () => worker()))

      const chunkUrls: string[] = results.filter((url): url is string => url !== null)

      if (chunkUrls.length === 0) {
        sse.send({ step: "tts_unavailable", message: "所有语音段合成均失败，请检查 TTS API 配置" })
        sse.send({ done: true, hasAudio: false, script: dialogue })
        sse.done()
        return
      }

      const manifest = { chunks: chunkUrls, createdAt: new Date().toISOString() }
      await writeFile(AUDIO_MANIFEST_PATH(projectPrefix), JSON.stringify(manifest), {
        contentType: "application/json",
      })

      sse.send({ done: true, hasAudio: true, manifest, script: dialogue })
      sse.done()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "未知错误"
      sse.send({ error: msg })
      sse.done()
    }
  })
}
