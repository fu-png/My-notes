/**
 * 音频概述 API — Podcast 风格双人对话 TTS
 *
 * POST /api/projects/[id]/audio
 *   action: "generate"  — 生成对话脚本 + TTS 合成音频
 *   action: "status"    — 检查是否已有音频缓存
 *   action: "script"    — 仅生成对话脚本（不合成 TTS）
 *
 * 流程：
 *   1. 读取项目所有文档内容
 *   2. 调用 LLM 生成双人对话脚本（Host + Expert）
 *   3. 调用 OpenAI TTS API 分段合成音频
 *   4. 合并音频片段，存入项目目录
 *   5. 返回播放 URL
 */

import { NextRequest } from "next/server"
import { readFile, listFiles, writeFile, readFileBuffer } from "@/lib/storage"

export const maxDuration = 300

type RouteContext = { params: Promise<{ id: string }> }

interface DialogueLine {
  speaker: "host" | "expert"
  text: string
}

const AUDIO_PATH = (projectId: string) => `projects/${projectId}/.audio/overview.mp3`
const SCRIPT_PATH = (projectId: string) => `projects/${projectId}/.audio/script.json`

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

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: projectId } = await context.params
  const body = await request.json()
  const { action, apiKey, apiBase, model, ttsModel, voiceHost, voiceExpert } = body

  if (!projectId) {
    return Response.json({ error: "缺少项目 ID" }, { status: 400 })
  }

  // ─── 状态查询：检查是否已有缓存音频 ───
  if (action === "status") {
    const audioBuffer = await readFileBuffer(AUDIO_PATH(projectId))
    const scriptData = await readFile(SCRIPT_PATH(projectId))

    return Response.json({
      hasAudio: !!audioBuffer,
      hasScript: !!scriptData,
      script: scriptData ? JSON.parse(scriptData) : null,
    })
  }

  // 以下操作都需要 API Key
  if (!apiKey) {
    return Response.json({ error: "需要 API Key" }, { status: 400 })
  }

  // ─── 读取项目文档 ───
  const allFiles = await listFiles(`projects/${projectId}/`)
  const mdFiles = allFiles.filter(
    (f) =>
      !f.pathname.endsWith("/meta.json") &&
      !f.pathname.includes("/.rag/") &&
      !f.pathname.includes("/.audio/") &&
      (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
  )

  if (mdFiles.length === 0) {
    return Response.json({ error: "项目中没有可用的文档" }, { status: 400 })
  }

  const documents: string[] = []
  for (const file of mdFiles) {
    const content = await readFile(file.pathname)
    if (content && content.trim().length > 0) {
      const filename = file.pathname.split("/").pop() || file.pathname
      documents.push(`--- 文档: ${filename} ---\n${content}`)
    }
  }

  const fullContent = documents.join("\n\n")
  const maxChars = 60000
  const truncatedContent = fullContent.length > maxChars
    ? fullContent.slice(0, maxChars) + "\n\n[...内容已截断...]"
    : fullContent

  // ─── 仅生成脚本 or 完整生成 ───
  if (action === "script" || action === "generate") {
    const apiBaseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")

    // SSE 流式返回
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Step 1: 生成对话脚本
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "script", progress: "正在生成对话脚本..." })}\n\n`))

          const chatModel = model || "gpt-4o-mini"
          const messages = [
            { role: "system", content: DIALOGUE_PROMPT },
            { role: "user", content: `以下是项目文档内容（共 ${mdFiles.length} 个文件）：\n\n${truncatedContent}\n\n请直接输出 JSON 对象，格式为 {"dialogue": [...]}，不要包含任何其他文字。注意：text 字段中不要使用未转义的双引号，如需引用请用中文引号「」。` },
          ]

          // 先尝试带 response_format 的请求（确保 JSON 输出）
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

          // 如果 response_format 不被支持（400/422），去掉它重试
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `脚本生成失败: ${scriptRes.status} ${err.slice(0, 200)}` })}\n\n`))
            controller.close()
            return
          }

          const scriptData = await scriptRes.json()
          const rawContent = scriptData.choices?.[0]?.message?.content || ""

          let dialogue: DialogueLine[]
          try {
            // 尝试多种方式提取 JSON
            let jsonStr = ""

            // 方法 1: 提取 ```json ... ``` 代码块
            const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/)
            if (codeBlockMatch) {
              jsonStr = codeBlockMatch[1].trim()
            }

            // 方法 2: 直接查找 JSON 数组
            if (!jsonStr) {
              const jsonMatch = rawContent.match(/\[[\s\S]*\]/)
              if (jsonMatch) {
                jsonStr = jsonMatch[0]
              }
            }

            // 方法 3: 整个内容就是 JSON
            if (!jsonStr) {
              jsonStr = rawContent.trim()
            }

            if (!jsonStr) throw new Error("未找到 JSON 内容")

            // 尝试直接解析
            let parsed: unknown
            try {
              parsed = JSON.parse(jsonStr)
            } catch {
              // JSON 解析失败时，尝试修复常见问题
              // 修复 1: 移除可能的 BOM 和不可见字符
              jsonStr = jsonStr.replace(/^\uFEFF/, "").replace(/[\x00-\x1F\x7F]/g, (ch) => {
                // 保留 \n \r \t，其他控制字符移除
                if (ch === "\n" || ch === "\r" || ch === "\t") return ch
                return ""
              })

              // 修复 2: 修复 text 字段中未转义的换行符
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
                // 修复 3: 逐行提取方式（正则匹配每个对象）
                const items: DialogueLine[] = []
                const lineRegex = /\{\s*"speaker"\s*:\s*"(host|expert)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g
                let match
                while ((match = lineRegex.exec(rawContent)) !== null) {
                  items.push({
                    speaker: match[1] as "host" | "expert",
                    text: match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
                  })
                }
                // 也尝试 text 在前 speaker 在后的格式
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

            // 支持直接数组或 { dialogue: [...] } 对象格式
            const dialogueArray = Array.isArray(parsed)
              ? parsed
              : (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).dialogue))
                ? (parsed as Record<string, unknown>).dialogue as unknown[]
                : []
            dialogue = dialogueArray as DialogueLine[]

            // 验证并清洗数据
            dialogue = dialogue
              .filter((d) => d && typeof d.text === "string" && d.text.trim().length > 0)
              .map((d) => ({
                speaker: d.speaker === "expert" ? "expert" as const : "host" as const,
                text: d.text.trim(),
              }))

            if (dialogue.length === 0) {
              throw new Error("解析后没有有效的对话行")
            }
          } catch (parseError: unknown) {
            const parseMsg = parseError instanceof Error ? parseError.message : "未知解析错误"
            console.error("[Audio] JSON parse error:", parseMsg, "\nRaw content (first 500 chars):", rawContent.slice(0, 500))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `对话脚本格式解析失败: ${parseMsg}，请重试` })}\n\n`))
            controller.close()
            return
          }

          // 保存脚本
          await writeFile(SCRIPT_PATH(projectId), JSON.stringify(dialogue, null, 2), { contentType: "application/json" })

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "script_done", script: dialogue, lineCount: dialogue.length })}\n\n`))

          // 如果仅生成脚本，到此结束
          if (action === "script") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, hasAudio: false })}\n\n`))
            controller.close()
            return
          }

          // Step 2: TTS 合成
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "tts", progress: "正在合成语音..." })}\n\n`))

          const audioChunks: Buffer[] = []
          const hostVoice = voiceHost || "alloy"
          const expertVoice = voiceExpert || "nova"
          const ttsModelName = ttsModel || "tts-1"

          for (let i = 0; i < dialogue.length; i++) {
            const line = dialogue[i]
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "tts_progress", progress: `合成语音 (${i + 1}/${dialogue.length})...`, current: i + 1, total: dialogue.length })}\n\n`))

            try {
              const ttsRes = await fetch(`${apiBaseUrl}/audio/speech`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: ttsModelName,
                  input: line.text,
                  voice: line.speaker === "host" ? hostVoice : expertVoice,
                  response_format: "mp3",
                }),
              })

              if (!ttsRes.ok) {
                // TTS API 不可用，返回仅脚本结果
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "tts_unavailable", message: "TTS API 不可用，已生成对话脚本，你可以使用浏览器朗读功能收听" })}\n\n`))
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, hasAudio: false, script: dialogue })}\n\n`))
                controller.close()
                return
              }

              const audioBuffer = Buffer.from(await ttsRes.arrayBuffer())
              audioChunks.push(audioBuffer)
            } catch {
              // 单段失败不中断
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "tts_progress", progress: `第 ${i + 1} 段合成失败，跳过` })}\n\n`))
            }
          }

          // Step 3: 合并音频（直接拼接 MP3 frames 是合法的）
          if (audioChunks.length > 0) {
            const mergedBuffer = Buffer.concat(audioChunks)
            const stored = await writeFile(AUDIO_PATH(projectId), mergedBuffer, { contentType: "audio/mpeg" })

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, hasAudio: true, audioUrl: stored.url, script: dialogue })}\n\n`))
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, hasAudio: false, script: dialogue })}\n\n`))
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : "未知错误"
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  return Response.json({ error: `未知操作: ${action}` }, { status: 400 })
}
