import { NextRequest } from "next/server"
import {
  proxyToBackend,
  proxyFormDataToBackend,
  proxyRawToBackend,
} from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

// POST — upload file(s) to a project
// 后端路由是 /projects/:id/files/* (通配符路由)，需要至少一个路径段才能匹配
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id } = await params
  const formData = await request.formData()
  return proxyFormDataToBackend(`/projects/${id}/files/upload`, formData)
}

// GET — read file content (may return text, so use raw proxy)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname } = await params
  const subPath = pathname ? `/${pathname.join("/")}` : ""
  const searchParams = request.nextUrl.searchParams
  return proxyRawToBackend("GET", `/projects/${id}/files${subPath}`, { searchParams })
}

// PUT — update file content
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname } = await params
  const subPath = pathname ? `/${pathname.join("/")}` : ""
  const body = await request.json()
  return proxyToBackend("PUT", `/projects/${id}/files${subPath}`, { body })
}

// PATCH — rename a file
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname } = await params
  const subPath = pathname ? `/${pathname.join("/")}` : ""
  const body = await request.json()
  return proxyToBackend("PATCH", `/projects/${id}/files${subPath}`, { body })
}

// DELETE — delete a file
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pathname?: string[] }> }
) {
  const { id, pathname } = await params
  const subPath = pathname ? `/${pathname.join("/")}` : ""
  return proxyToBackend("DELETE", `/projects/${id}/files${subPath}`)
}
