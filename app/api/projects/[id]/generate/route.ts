/**
 * AI 笔记生成 API
 *
 * POST /api/projects/[id]/generate — 基于项目所有来源生成结构化笔记
 *   type: "summary"   — 项目摘要
 *   type: "faq"       — 常见问题
 *   type: "guide"     — 学习指南
 *   type: "outline"   — 内容大纲
 *   type: "timeline"  — 时间线
 *   type: "briefing"  — 简报文档
 *
 * 以 SSE 流式返回生成的内容
 */

import { NextRequest } from "next/server"
import { readFile, listFiles } from "@/lib/storage"

export const maxDuration = 300

type RouteContext = { params: Promise<{ id: string }> }

// 生成模板 Prompt
const TEMPLATES: Record<string, { name: string; prompt: string }> = {
  summary: {
    name: "项目摘要",
    prompt: `请基于以下所有文档内容，生成一份全面的项目摘要。要求：
1. 首先用 2-3 句话概括项目的核心主题
2. 分主题总结各文档的关键内容
3. 提炼出最重要的 5-8 个核心概念
4. 总结文档之间的关联和整体架构
5. 使用中文，采用 Markdown 格式，适合作为项目总览笔记`,
  },
  faq: {
    name: "常见问题",
    prompt: `请基于以下所有文档内容，生成一份 FAQ（常见问题解答）。要求：
1. 提炼出 8-12 个最可能被问到的问题
2. 问题应覆盖核心概念、使用方法、设计原因、常见误区等
3. 每个回答简洁有力，100-200 字，引用文档中的具体内容
4. 问题从浅到深排列
5. 使用中文，采用 Markdown 格式，每个 Q&A 用 ### 标题分隔`,
  },
  guide: {
    name: "学习指南",
    prompt: `请基于以下所有文档内容，生成一份系统的学习指南。要求：
1. 设计一条由浅入深的学习路径
2. 将内容分为"入门→进阶→深入"三个阶段
3. 每个阶段列出需要理解的关键概念和建议的阅读顺序
4. 标注前置知识要求和难度级别
5. 给出学习建议和实践练习方向
6. 使用中文，采用 Markdown 格式，适合打印或保存为笔记`,
  },
  outline: {
    name: "内容大纲",
    prompt: `请基于以下所有文档内容，生成一份详细的内容大纲。要求：
1. 提取所有文档的标题层级结构
2. 在每个章节/段落下补充 1 行内容摘要
3. 标注各部分之间的逻辑关系（前置依赖、并列、递进等）
4. 统计每个部分的大致篇幅
5. 使用中文，采用 Markdown 多级标题格式`,
  },
  timeline: {
    name: "时间线",
    prompt: `请基于以下所有文档内容，生成一条逻辑时间线或演进路线。要求：
1. 如果文档包含时间信息，按时间顺序排列关键事件
2. 如果没有明确时间，按逻辑演进/因果关系排列
3. 每个节点包括：标题、简要描述（50 字内）、关键意义
4. 标注里程碑事件
5. 使用中文，采用 Markdown 格式，可以用列表或表格`,
  },
  briefing: {
    name: "简报文档",
    prompt: `请基于以下所有文档内容，生成一份精炼的简报文档，适合分享给团队成员快速了解项目。要求：
1. 控制在 500-800 字
2. 结构为：背景 → 核心要点 → 关键发现 → 行动建议
3. 语言精炼、结论导向
4. 使用中文，采用 Markdown 格式`,
  },
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: projectId } = await context.params
  const body = await request.json()
  const { type, apiKey, apiBase, model, customPrompt, deepThink } = body

  if (!projectId) {
    return Response.json({ error: "缺少项目 ID" }, { status: 400 })
  }
  if (!apiKey) {
    return Response.json({ error: "需要 API Key" }, { status: 400 })
  }

  const template = TEMPLATES[type]
  if (!template && !customPrompt) {
    return Response.json({ error: `未知的生成类型: ${type}` }, { status: 400 })
  }

  // 1. 读取项目所有文档
  const allFiles = await listFiles(`projects/${projectId}/`)
  const mdFiles = allFiles.filter(
    (f) =>
      !f.pathname.endsWith("/meta.json") &&
      !f.pathname.includes("/.rag/") &&
      (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
  )

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

  // 3. 构建 prompt
  const taskPrompt = customPrompt || template.prompt
  const fullContent = documents.join("\n\n")

  // 限制内容长度（粗略估计 token，按 2 字/token 计算中文）
  const maxChars = 80000 // 大约 40k tokens
  const truncatedContent = fullContent.length > maxChars
    ? fullContent.slice(0, maxChars) + "\n\n[...内容已截断...]"
    : fullContent

  const messages = [
    {
      role: "system",
      content: `你是一个专业的知识整理助手。请严格基于用户提供的文档内容完成任务，不要添加文档中没有的信息。输出使用 Markdown 格式。`,
    },
    {
      role: "user",
      content: `${taskPrompt}\n\n以下是项目中的所有文档内容（共 ${mdFiles.length} 个文件）：\n\n${truncatedContent}`,
    },
  ]

  // 4. 流式调用 LLM
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
            temperature: 0.3,
          }),
        })

        if (!res.ok) {
          const err = await res.text()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `API 调用失败: ${res.status} ${err.slice(0, 200)}` })}\n\n`))
          controller.close()
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "无法读取上游响应" })}\n\n`))
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

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
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
                if (reasoningContent) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning: reasoningContent })}\n\n`))
                }
              } catch {
              // skip
            }
          }
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
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
