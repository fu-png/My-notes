/**
 * API 代理工具 — 将前端 API route 请求转发到后端 Fastify 服务
 *
 * 设计目标：
 * 1. 生产模式从 httpOnly cookie 读取用户真实 JWT token
 * 2. 开发模式自动注册/登录并缓存 JWT token（向后兼容）
 * 3. Token 过期自动刷新
 * 4. 支持普通 JSON 请求和 SSE 流式请求的代理
 * 5. 支持 FormData (文件上传) 请求的代理
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000"

// 开发模式凭据（仅开发环境使用）
const DEV_EMAIL = "dev@test.com"
const DEV_PASSWORD = "dev123456"
const DEV_NAME = "开发者"

// 开发模式 token 缓存（进程级别）
let cachedAccessToken: string | null = null
let cachedRefreshToken: string | null = null
let tokenExpiresAt = 0

/**
 * 从 cookie 获取 token（生产模式）
 */
async function getTokenFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get("access_token")?.value
    if (accessToken) return accessToken

    // 尝试用 refresh token 刷新
    const refreshToken = cookieStore.get("refresh_token")?.value
    if (!refreshToken) return null

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })

    if (res.ok) {
      const data = await res.json()
      // 更新 cookie
      cookieStore.set("access_token", data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      })
      cookieStore.set("refresh_token", data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      })
      return data.accessToken
    }
  } catch {
    // cookie 读取失败（可能在非 route handler 上下文中）
  }
  return null
}

/**
 * 开发模式获取 token（向后兼容）
 */
async function getDevToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken
  }

  if (cachedRefreshToken) {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: cachedRefreshToken }),
      })
      if (res.ok) {
        const data = await res.json()
        cachedAccessToken = data.accessToken
        cachedRefreshToken = data.refreshToken
        tokenExpiresAt = Date.now() + 14 * 60 * 1000
        return cachedAccessToken!
      }
    } catch {
      // refresh 失败，走登录流程
    }
  }

  let res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  })

  if (!res.ok) {
    res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME }),
    })
  }

  if (!res.ok) {
    throw new Error(`[api-proxy] 无法获取开发 token: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  cachedAccessToken = data.accessToken
  cachedRefreshToken = data.refreshToken
  tokenExpiresAt = Date.now() + 14 * 60 * 1000
  return cachedAccessToken!
}

/**
 * 获取有效的 access token
 * 优先使用 cookie 中的真实用户 token，回退到开发模式
 */
async function getAccessToken(): Promise<string> {
  // 优先从 cookie 读取（真实用户）
  const cookieToken = await getTokenFromCookie()
  if (cookieToken) return cookieToken

  // 回退到开发模式
  return getDevToken()
}

/**
 * 代理普通 JSON 请求到后端
 */
export async function proxyToBackend(
  method: string,
  backendPath: string,
  options?: {
    body?: unknown
    headers?: Record<string, string>
    searchParams?: URLSearchParams
  }
): Promise<NextResponse> {
  try {
    const token = await getAccessToken()
    let url = `${API_BASE}${backendPath}`
    if (options?.searchParams?.toString()) {
      url += `?${options.searchParams.toString()}`
    }

    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    }

    const fetchOptions: RequestInit = {
      method,
      headers: fetchHeaders,
    }

    if (options?.body !== undefined) {
      fetchHeaders["Content-Type"] = "application/json"
      fetchOptions.body = JSON.stringify(options.body)
    }

    const res = await fetch(url, fetchOptions)
    const data = await res.json()

    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error(`[api-proxy] ${method} ${backendPath} error:`, error)
    const message = error instanceof Error ? error.message : "代理请求失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/**
 * 代理 SSE 流式请求到后端
 */
export async function proxySSEToBackend(
  backendPath: string,
  options?: {
    body?: unknown
    headers?: Record<string, string>
  }
): Promise<Response> {
  try {
    const token = await getAccessToken()
    const url = `${API_BASE}${backendPath}`

    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    }

    const res = await fetch(url, {
      method: "POST",
      headers: fetchHeaders,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "后端请求失败" }))
      return new Response(JSON.stringify(errorData), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error(`[api-proxy] SSE ${backendPath} error:`, error)
    const message = error instanceof Error ? error.message : "代理请求失败"
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }
}

/**
 * 代理 FormData (文件上传) 请求到后端
 */
export async function proxyFormDataToBackend(
  backendPath: string,
  formData: FormData
): Promise<NextResponse> {
  try {
    const token = await getAccessToken()
    const url = `${API_BASE}${backendPath}`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error(`[api-proxy] FormData ${backendPath} error:`, error)
    const message = error instanceof Error ? error.message : "代理请求失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/**
 * 代理二进制/文本响应（如文件下载）
 */
export async function proxyRawToBackend(
  method: string,
  backendPath: string,
  options?: {
    body?: unknown
    headers?: Record<string, string>
    searchParams?: URLSearchParams
  }
): Promise<Response> {
  try {
    const token = await getAccessToken()
    let url = `${API_BASE}${backendPath}`
    if (options?.searchParams?.toString()) {
      url += `?${options.searchParams.toString()}`
    }

    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    }

    const fetchOptions: RequestInit = {
      method,
      headers: fetchHeaders,
    }

    if (options?.body !== undefined) {
      fetchHeaders["Content-Type"] = "application/json"
      fetchOptions.body = JSON.stringify(options.body)
    }

    const res = await fetch(url, fetchOptions)

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": res.headers.get("Content-Disposition") || "",
      },
    })
  } catch (error) {
    console.error(`[api-proxy] raw ${method} ${backendPath} error:`, error)
    const message = error instanceof Error ? error.message : "代理请求失败"
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }
}

/**
 * 从 server component 调用后端 API（用于 SSR 数据获取）
 */
export async function fetchFromBackend<T = unknown>(
  backendPath: string,
  options?: {
    method?: string
    body?: unknown
    searchParams?: URLSearchParams
  }
): Promise<{ data: T | null; status: number; error?: string }> {
  try {
    const token = await getAccessToken()
    let url = `${API_BASE}${backendPath}`
    if (options?.searchParams?.toString()) {
      url += `?${options.searchParams.toString()}`
    }

    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    }

    const fetchOptions: RequestInit = {
      method: options?.method || "GET",
      headers: fetchHeaders,
      cache: "no-store",
    }

    if (options?.body !== undefined) {
      fetchHeaders["Content-Type"] = "application/json"
      fetchOptions.body = JSON.stringify(options.body)
    }

    const res = await fetch(url, fetchOptions)
    const data = await res.json()

    if (!res.ok) {
      return { data: null, status: res.status, error: data.error || "请求失败" }
    }

    return { data, status: res.status }
  } catch (error) {
    console.error(`[api-proxy] fetchFromBackend ${backendPath} error:`, error)
    const message = error instanceof Error ? error.message : "请求失败"
    return { data: null, status: 502, error: message }
  }
}
