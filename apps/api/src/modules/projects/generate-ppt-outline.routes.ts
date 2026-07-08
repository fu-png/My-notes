import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { SSEWriter, relayUpstreamSSE } from "../../lib/sse.js"
import { listFiles, readFile, userProjectPrefix } from "../../lib/storage.js"
import { isValidProjectId } from "../../lib/validation.js"
import { queryProject, getIndexStatus } from "../../lib/rag/pipeline.js"
import type { RAGConfig } from "../../lib/rag/types.js"

/**
 * PPT 大纲生成 API（流式）
 *
 * POST /projects/:id/generate-ppt-outline
 *   基于项目文档内容通过 LLM 生成 PPT 大纲 JSON，SSE 流式返回生成进度和最终 JSON
 *
 * 迁移自 apps/web/app/api/projects/[id]/generate-ppt-outline/route.ts。
 *
 * RAG 检索增强：ragEnabled=true 时调用 lib/rag/pipeline 的 queryProject /
 * getIndexStatus 做检索增强，将检索到的上下文拼入 prompt 以提升大纲质量。
 */

interface PptOutline {
  title: string
  style: string
  slides: unknown[]
}

export default async function generatePptOutlineRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { id: string }
    Body: {
      apiKey?: string
      apiBase?: string
      model?: string
      stylePreset?: string
      styleDescription?: string
      customPrompt?: string
      slideCount?: number
      ragEnabled?: boolean
      ragConfig?: Record<string, unknown>
      conversationContext?: Array<{ role: string; content: string }>
      selectedFiles?: string[]
    }
  }>("/projects/:id/generate-ppt-outline", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id: projectId } = request.params
    if (!isValidProjectId(projectId)) {
      return reply.code(400).send({ error: "无效的项目 ID" })
    }

    const project = await requireProject(request, reply, projectId)
    if (!project) return

    const {
      apiKey,
      apiBase,
      model,
      stylePreset,
      styleDescription,
      customPrompt,
      slideCount,
      ragEnabled,
      conversationContext,
      selectedFiles,
    } = request.body ?? {}

    if (!apiKey) {
      return reply.code(400).send({ error: "需要 API Key" })
    }

    const { userId } = getAuthContext(request)
    const projectPrefix = userProjectPrefix(userId, projectId)

    // 1. 读取项目所有文档
    const allFiles = await listFiles(projectPrefix, true)
    let mdFiles = allFiles.filter(
      (f) =>
        !f.pathname.endsWith("/meta.json") &&
        !f.pathname.includes("/.rag/") &&
        !f.pathname.includes("/.audio/") &&
        (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
    )

    if (selectedFiles && selectedFiles.length > 0) {
      mdFiles = mdFiles.filter((f) => selectedFiles.includes(f.pathname.slice(projectPrefix.length)))
    }

    if (mdFiles.length === 0) {
      return reply.code(400).send({ error: "项目中没有可用的文档" })
    }

    // 2. 读取所有文件内容（并行）
    const documentEntries = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await readFile(file.pathname)
        if (content && content.trim().length > 0) {
          const filename = file.pathname.split("/").pop() || file.pathname
          return `--- 文档: ${filename} ---\n${content}`
        }
        return null
      })
    )
    const documents = documentEntries.filter((d): d is string => d !== null)

    // RAG 检索增强：如果启用且项目已建立索引，检索相关内容以提升大纲质量
    let ragContext = ""
    let ragSources = ""
    if (ragEnabled) {
      const status = await getIndexStatus(userId, projectId)
      if (status?.indexed) {
        try {
          const defaultRagConfig: RAGConfig = {
            apiBase: apiBase || "https://api.openai.com/v1",
            apiKey: apiKey,
            embeddingModel: "text-embedding-3-small",
            chatModel: model || "gpt-4o-mini",
            maxContextTokens: 6000,
          }
          const ragCfg: RAGConfig = {
            ...defaultRagConfig,
            ...(request.body.ragConfig as Partial<RAGConfig> | undefined),
          }
          const query = `生成关于这个项目的演示文稿，涵盖核心概念、架构设计、关键功能`
          const assembled = await queryProject(userId, projectId, query, ragCfg)
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

    // 3. 构建 prompt
    const fullContent = documents.join("\n\n")
    const maxChars = 80000
    const truncatedContent =
      fullContent.length > maxChars ? fullContent.slice(0, maxChars) + "\n\n[...内容已截断...]" : fullContent

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
${conversationContext.map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`).join("\n")}

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

    // 4. 流式调用 LLM
    const apiBaseUrl = (apiBase || "https://api.openai.com/v1").replace(/\/+$/, "")

    let res: Response
    try {
      res = await fetch(`${apiBaseUrl}/chat/completions`, {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误"
      return reply.code(500).send({ error: `请求异常: ${msg}` })
    }

    const sse = new SSEWriter(reply)

    if (!res.ok) {
      const err = await res.text()
      sse.start()
      sse.send({ error: `API 调用失败: ${res.status} ${err.slice(0, 200)}` })
      sse.done()
      return
    }

    if (!res.body) {
      sse.start()
      sse.send({ error: "无法读取上游响应" })
      sse.done()
      return
    }

    sse.start()
    try {
      const { content: fullContent2 } = await relayUpstreamSSE(res.body, sse)

      // Try multiple strategies to extract JSON
      let jsonStr = fullContent2.trim()

      if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7)
      else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3)
      if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3)
      jsonStr = jsonStr.trim()

      try {
        JSON.parse(jsonStr)
      } catch {
        const jsonMatch = fullContent2.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          jsonStr = jsonMatch[0]
        }
      }

      try {
        const parsed = JSON.parse(jsonStr) as PptOutline
        sse.send({ outline: parsed })
      } catch {
        sse.send({ rawContent: fullContent2 })
      }

      sse.done()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误"
      sse.send({ error: msg })
      sse.done()
    }
  })
}
