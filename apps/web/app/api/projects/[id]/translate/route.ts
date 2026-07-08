/**
 * 翻译 API
 *
 * POST /api/projects/[id]/translate
 *   代理到后端，以 SSE 流式返回翻译结果
 */

import { NextRequest } from "next/server"
import { proxySSEToBackend } from "@/lib/api-proxy"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return proxySSEToBackend(`/projects/${id}/translate`, { body })
}
