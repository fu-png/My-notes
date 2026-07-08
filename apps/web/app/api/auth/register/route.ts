import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000"

const COOKIE_SECURE = process.env.COOKIE_SECURE === "true"

export const dynamic = "force-dynamic"

/**
 * POST /api/auth/register
 * 代理注册请求到后端，并将 token 设置为 httpOnly cookie
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "注册失败" },
        { status: res.status }
      )
    }

    const cookieStore = await cookies()
    cookieStore.set("access_token", data.accessToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    })
    cookieStore.set("refresh_token", data.refreshToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    })

    return NextResponse.json({
      user: data.user,
      organizationId: data.organizationId,
    })
  } catch (error) {
    console.error("[auth/register] error:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
