/**
 * PPT 大纲生成 API
 *
 * POST /api/projects/[id]/generate-ppt-outline
 *   代理到后端，以 SSE 流式返回生成进度和最终 JSON
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
  return proxySSEToBackend(`/projects/${id}/generate-ppt-outline`, { body })
}
