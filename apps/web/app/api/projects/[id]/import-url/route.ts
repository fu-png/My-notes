import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

// POST /api/projects/[id]/import-url — 从 URL 抓取文章内容并保存为 Markdown
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return proxyToBackend("POST", `/projects/${id}/import-url`, { body })
}
