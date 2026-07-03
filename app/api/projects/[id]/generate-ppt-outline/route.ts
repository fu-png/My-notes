/**
 * PPT 大纲生成 API
 *
 * POST /api/projects/[id]/generate-ppt-outline
 *   基于项目文档内容 + RAG 检索，通过 LLM 生成 PPT 大纲 JSON
 *   以 SSE 流式返回生成进度和最终 JSON
 */

import { NextRequest } from "next/server"
import { readFile, listFiles } from "@/lib/storage"
import { queryProject, getIndexStatus } from "@/lib/rag/pipeline"
import type { RAGConfig } from "@/lib/rag/types"
import { isValidProjectId, invalidProjectIdResponse } from "@/lib/validation"

export const maxDuration = 300

type RouteContext = { params: Promise<{ id: string }> }

interface PptOutline {
  title: string
  style: string
  slides: unknown[]
}

const DEFAULT_RAG_CONFIG: RAGConfig = {
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  embeddingModel: "text-embedding-3-small",
  chatModel: "gpt-4o-mini",
  maxContextTokens: 6000,
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: projectId } = await context.params

  if (!isValidProjectId(projectId)) {
    return invalidProjectIdResponse()
  }

  const body = await request.json()
  const {
    apiKey,
    apiBase,
    model,
    stylePreset,
    styleDescription,
    customPrompt,
    slideCount,
    ragEnabled,
    ragConfig,
    conversationContext,
    selectedFiles,
  } = body

  if (!projectId) {
    return Response.json({ error: "缺少项目 ID" }, { status: 400 })
  }
  if (!apiKey) {
    return Response.json({ error: "需要 API Key" }, { status: 400 })
  }

  // 1. 读取项目所有文档
  const allFiles = await listFiles(`projects/${projectId}/`, true)
  let mdFiles = allFiles.filter(
    (f) =>
      !f.pathname.endsWith("/meta.json") &&
      !f.pathname.includes("/.rag/") &&
      !f.pathname.includes("/.audio/") &&
      (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
  )

  const projectPrefix = `projects/${projectId}/`
  if (selectedFiles && selectedFiles.length > 0) {
    mdFiles = mdFiles.filter((f) => selectedFiles.includes(f.pathname.slice(projectPrefix.length)))
  }

  if (mdFiles.length === 0) {
    return Response.json({ error: "项目中没有可用的文档" }, { status: 400 })
  }

  // 2. 读取所有文件内容
  const documents: string[] = []
  for (const file of mdFiles) {
    const content = await readFile(file.pathname)
    if (content && content.trim().length > 0) {
      const filename = file.pathname.split("/").pop() || file.pathname
      documents.push(`--- 文档: ${filename} ---\n${content}`)
    }
  }

  let ragContext = ""
  let ragSources = ""

  // 3. 如果启用 RAG，检索相关内容
  if (ragEnabled) {
    const status = await getIndexStatus(projectId)
    if (status?.indexed) {
      try {
        const config = { ...DEFAULT_RAG_CONFIG, ...ragConfig }
        const query = `生成关于这个项目的演示文稿，涵盖核心概念、架构设计、关键功能`
        const assembled = await queryProject(projectId, query, config)
        if (assembled.text) {
          ragContext = assembled.text
          ragSources = assembled.sources
            .map((s, i) => `来源 ${i + 1}: ${s.fileTitle}`)
            .join("\n")
        }
      } catch (err) {
        console.error("[PPT outline] RAG query failed:", err)
      }
    }
  }

  // 4. 构建 prompt
  const fullContent = documents.join("\n\n")
  const maxChars = 80000
  const truncatedContent =
    fullContent.length > maxChars
      ? fullContent.slice(0, maxChars) + "\n\n[...内容已截断...]"
      : fullContent

  const count = slideCount || 8
  const styleDesc = styleDescription || "modern professional presentation style"

  const systemPrompt = `你是一个专业的 PPT 大纲设计师。请基于用户提供的文档内容，生成一个 ${count} 页的演示文稿大纲。

核心原则：
1. 严格基于文档内容，不要编造文档中没有的信息
2. 必须充分覆盖文档中的核心内容和关键知识点，不能只做泛泛的总结
3. 如果文档包含多个章节或主题，每个重要章节/主题至少分配一页幻灯片
4. 内容页的要点应该包含具体的信息、数据、概念名称、技术术语，避免空泛的描述

页面布局规则：
- 第一页为封面（layout: "cover"），包含PPT主标题和副标题
- 最后一页为总结/结尾（layout: "closing"），归纳核心要点和行动建议
- 如果文档有多个章节，在每个章节的第一页使用章节页（layout: "section"）作为分隔
- 其余为内容页（layout: "content"），展开讲解具体内容

内容质量要求：
- 每页 3-5 个要点，每个要点应是一句完整的、有信息量的陈述，而非简单的标题词
- bulletPoints 中要包含文档中的关键概念、核心观点、具体方法或示例
- speakerNote 应包含更详细的解释、补充背景信息和过渡语句（100-200字）
- imageHint 用英文描述，应与该页核心主题相关，描述具体的视觉场景（不要用抽象词汇）

风格：${styleDesc}
${customPrompt ? `用户补充要求：${customPrompt}` : ""}

输出严格的 JSON 格式（不要包含 markdown 代码块标记），结构如下：
{
  "title": "PPT 标题",
  "style": "${stylePreset || "corporate"}",
  "slides": [
    {
      "pageNumber": 1,
      "title": "页面标题",
      "bulletPoints": ["具体的要点陈述1", "具体的要点陈述2", "具体的要点陈述3"],
      "speakerNote": "详细的演讲备注，包含过渡语、补充解释等...",
      "layout": "cover",
      "imageHint": "A specific visual scene description in English for AI image generation"
    }
  ]
}`

  const conversationContextText =
    conversationContext && conversationContext.length > 0
      ? `以下是之前的对话上下文：
${conversationContext.map((m: { role: string; content: string }) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`).join("\n")}

`
      : ""

  const userContent = ragContext
    ? `${conversationContextText}以下是从笔记本中检索到的相关内容片段（RAG 检索结果）：

${ragContext}

来源清单：
${ragSources}

以下是项目中的所有文档内容（共 ${mdFiles.length} 个文件）：

${truncatedContent}`
    : `${conversationContextText}以下是项目中的所有文档内容（共 ${mdFiles.length} 个文件）：

${truncatedContent}`

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]

  // 5. 流式调用 LLM
  const apiBaseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${apiBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages,
            stream: true,
            temperature: 0.4,
            max_tokens: 16384,
          }),
        })

        if (!res.ok) {
          const err = await res.text()
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: `API 调用失败: ${res.status} ${err.slice(0, 200)}` })}\n\n`
            )
          )
          controller.close()
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "无法读取上游响应" })}\n\n`)
          )
          controller.close()
          return
        }

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
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            const data = trimmed.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta
              const content = delta?.content
              const reasoningContent = delta?.reasoning_content || delta?.reasoning
              if (content) {
                fullContent += content
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                )
              }
              if (reasoningContent) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ reasoning: reasoningContent })}\n\n`)
                )
              }
            } catch {
              // skip
            }
          }
        }

        // Try multiple strategies to extract JSON
        let jsonStr = fullContent.trim()

        // Strategy 1: Strip markdown code blocks
        if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7)
        else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3)
        if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3)
        jsonStr = jsonStr.trim()

        // Strategy 2: If still not valid JSON, try regex extraction
        try {
          JSON.parse(jsonStr)
        } catch {
          const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            jsonStr = jsonMatch[0]
          }
        }

        try {
          const parsed = JSON.parse(jsonStr) as PptOutline
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ outline: parsed })}\n\n`)
          )
        } catch {
          // JSON 解析失败，发送原始内容让前端处理
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ rawContent: fullContent })}\n\n`
            )
          )
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "未知错误"
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        )
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
