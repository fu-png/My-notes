import { NextRequest } from "next/server"
import { proxyToBackend, proxySSEToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/projects/[id]/rag — 执行 RAG 操作 (index/query/status/sources/delete)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  // 流式索引操作使用 SSE 代理
  if (body.action === "index" && body.stream) {
    return proxySSEToBackend(`/projects/${id}/rag`, { body })
  }

  return proxyToBackend("POST", `/projects/${id}/rag`, { body })
}
