import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

/**
 * POST /api/auth/logout
 * 清除认证 cookie
 */
export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete("access_token")
  cookieStore.delete("refresh_token")
  return NextResponse.json({ success: true })
}
