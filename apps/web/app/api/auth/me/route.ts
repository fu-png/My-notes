import { NextResponse } from "next/server"
import { cookies } from "next/headers"

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000"

const COOKIE_SECURE = process.env.COOKIE_SECURE === "true"

export const dynamic = "force-dynamic"

/**
 * GET /api/auth/me
 * 获取当前登录用户信息。从 cookie 读取 token，必要时自动刷新。
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    let accessToken = cookieStore.get("access_token")?.value
    const refreshToken = cookieStore.get("refresh_token")?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    // 先用 accessToken 尝试获取用户信息
    if (accessToken) {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json(data)
      }
    }

    // 用 refreshToken 刷新
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })

      if (refreshRes.ok) {
        const tokens = await refreshRes.json()

        cookieStore.set("access_token", tokens.accessToken, {
          httpOnly: true,
          secure: COOKIE_SECURE,
          sameSite: "lax",
          path: "/",
          maxAge: 15 * 60,
        })
        cookieStore.set("refresh_token", tokens.refreshToken, {
          httpOnly: true,
          secure: COOKIE_SECURE,
          sameSite: "lax",
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
        })

        accessToken = tokens.accessToken
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.ok) {
          const data = await res.json()
          return NextResponse.json(data)
        }
      }
    }

    return NextResponse.json({ error: "认证已过期，请重新登录" }, { status: 401 })
  } catch (error) {
    console.error("[auth/me] error:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
