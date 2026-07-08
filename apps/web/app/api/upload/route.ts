import { NextRequest } from "next/server"
import { proxyFormDataToBackend } from "@/lib/api-proxy"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  return proxyFormDataToBackend("/upload", formData)
}
