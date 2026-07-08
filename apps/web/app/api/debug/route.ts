import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const headers: Record<string, string> = {}
  const debugToken = request.headers.get("x-debug-token")
  if (debugToken) headers["x-debug-token"] = debugToken
  return proxyToBackend("GET", "/debug", { searchParams, headers })
}
