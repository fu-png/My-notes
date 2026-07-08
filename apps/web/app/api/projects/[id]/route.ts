import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

// GET /api/projects/[id] — get project detail with file list
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyToBackend("GET", `/projects/${id}`)
}

// PATCH /api/projects/[id] — update project metadata (e.g. rename)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return proxyToBackend("PATCH", `/projects/${id}`, { body })
}

// DELETE /api/projects/[id] — delete entire project
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyToBackend("DELETE", `/projects/${id}`)
}
