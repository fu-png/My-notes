/**
 * 聊天记录持久化 API — 存储到阿里云 OSS
 *
 * GET  /api/projects/:id/chat-history  → 读取聊天记录
 * POST /api/projects/:id/chat-history  → 保存聊天记录
 *
 * 存储路径: projects/{projectId}/chat-history.json
 */

import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile, fileExists } from "@/lib/storage"
import { isValidProjectId, invalidProjectIdResponse } from "@/lib/validation"

type Params = Promise<{ id: string }>

// ─── GET: 读取聊天记录 ───
export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { id: projectId } = await params

  if (!isValidProjectId(projectId)) {
    return invalidProjectIdResponse()
  }

  const url = new URL(request.url)
  const mode = url.searchParams.get("mode") // "summary" | undefined

  try {
    const filePath = `projects/${projectId}/chat-history.json`
    const exists = await fileExists(filePath)

    if (!exists) {
      return NextResponse.json({ conversations: [] })
    }

    const content = await readFile(filePath)
    if (!content) return NextResponse.json({ conversations: [] })
    const conversations = JSON.parse(content)

    // Summary mode: return conversation metadata without full message content
    // This significantly reduces payload size for projects with many conversations
    if (mode === "summary") {
      const summaries = conversations.map((conv: Record<string, unknown>) => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0,
        // Include first user message preview for search (truncated)
        preview: Array.isArray(conv.messages) && conv.messages.length > 0
          ? String(conv.messages[0].content || "").slice(0, 200)
          : "",
      }))
      return NextResponse.json({ conversations: summaries })
    }

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error("[chat-history] GET error:", error)
    return NextResponse.json({ conversations: [] })
  }
}

// ─── POST: 保存聊天记录 ───
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { id: projectId } = await params

  if (!isValidProjectId(projectId)) {
    return invalidProjectIdResponse()
  }

  try {
    const { conversations } = await request.json()

    if (!Array.isArray(conversations)) {
      return NextResponse.json({ error: "conversations must be an array" }, { status: 400 })
    }

    // 限制对话数量，防止过大负载
    const MAX_CONVERSATIONS = 200
    if (conversations.length > MAX_CONVERSATIONS) {
      return NextResponse.json(
        { error: `对话数量超出限制（最多 ${MAX_CONVERSATIONS} 个）` },
        { status: 400 }
      )
    }

    // 消息结构校验：确保每个对话的消息格式合法
    const VALID_ROLES = new Set(["user", "assistant", "system"])
    const MAX_MESSAGES_PER_CONV = 500
    for (const conv of conversations) {
      if (typeof conv !== "object" || conv === null) {
        return NextResponse.json({ error: "对话格式无效" }, { status: 400 })
      }
      const c = conv as Record<string, unknown>
      // 校验必填字段
      if (typeof c.id !== "string" || !c.id.trim()) {
        return NextResponse.json({ error: "对话缺少 id 字段" }, { status: 400 })
      }
      // 校验消息数组
      if (Array.isArray(c.messages)) {
        if (c.messages.length > MAX_MESSAGES_PER_CONV) {
          return NextResponse.json(
            { error: `单个对话消息数超出限制（最多 ${MAX_MESSAGES_PER_CONV} 条）` },
            { status: 400 }
          )
        }
        for (const msg of c.messages) {
          const m = msg as Record<string, unknown>
          if (typeof m.role !== "string" || !VALID_ROLES.has(m.role)) {
            return NextResponse.json(
              { error: `消息 role 无效，必须为 user/assistant/system` },
              { status: 400 }
            )
          }
          if (typeof m.content !== "string") {
            return NextResponse.json(
              { error: "消息 content 必须为字符串" },
              { status: 400 }
            )
          }
        }
      }
    }

    // 清理大数据（base64 图片等）再存储
    const cleaned = conversations.map((conv: Record<string, unknown>) => ({
      ...conv,
      messages: (conv.messages as Record<string, unknown>[])?.map((msg: Record<string, unknown>) => {
        const pptMeta = msg.pptMeta as Record<string, unknown> | undefined
        if (!pptMeta?.slideImages) return msg
        return {
          ...msg,
          pptMeta: {
            ...pptMeta,
            slideImages: (pptMeta.slideImages as Record<string, unknown>[]).map((img: Record<string, unknown>) => ({
              ...img,
              // 去掉 base64 data URL，只保留远程 URL
              url: typeof img.url === "string" && !img.url.startsWith("data:") ? img.url : null,
            })),
          },
        }
      }),
    }))

    const filePath = `projects/${projectId}/chat-history.json`
    await writeFile(filePath, JSON.stringify(cleaned, null, 2), { contentType: "application/json" })

    return NextResponse.json({ success: true, count: cleaned.length })
  } catch (error) {
    console.error("[chat-history] POST error:", error)
    return NextResponse.json(
      { error: "保存失败" },
      { status: 500 }
    )
  }
}
