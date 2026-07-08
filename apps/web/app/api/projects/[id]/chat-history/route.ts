import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

// GET /api/projects/[id]/chat-history — 读取聊天记录
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyToBackend("GET", `/projects/${id}/chat-history`, {
    searchParams: request.nextUrl.searchParams,
  })
}

// POST /api/projects/[id]/chat-history — 保存聊天记录
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return proxyToBackend("POST", `/projects/${id}/chat-history`, { body })
}
