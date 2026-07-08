/**
 * 音频概述 API — Podcast 风格双人对话 TTS
 *
 * POST /api/projects/[id]/audio
 *   代理到后端，以 SSE 流式返回生成进度
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
  return proxySSEToBackend(`/projects/${id}/audio`, { body })
}
