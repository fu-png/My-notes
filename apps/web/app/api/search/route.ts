import { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  return proxyToBackend("GET", "/search", { searchParams })
}
