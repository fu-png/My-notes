/**
 * AI 笔记生成 API
 *
 * POST /api/projects/[id]/generate — 代理到后端生成结构化笔记
 * 以 SSE 流式返回生成的内容
 */

import { NextRequest } from "next/server"
import { proxySSEToBackend } from "@/lib/api-proxy"

export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return proxySSEToBackend(`/projects/${id}/generate`, { body })
}
