import { proxyToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

export async function GET() {
  return proxyToBackend("GET", "/billing/subscription")
}
