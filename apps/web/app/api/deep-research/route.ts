import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const body = await request.json()
  return proxyToBackend("POST", "/deep-research", { body })
}
