import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

// GET /api/projects — list all projects
export async function GET() {
  return proxyToBackend("GET", "/projects")
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  const body = await request.json()
  return proxyToBackend("POST", "/projects", { body })
}
