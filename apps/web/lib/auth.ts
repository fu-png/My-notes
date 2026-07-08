/**
 * 前端认证工具库
 *
 * Token 存储策略：
 * - accessToken 和 refreshToken 存储在 httpOnly cookie 中（由 Next.js API route 设置）
 * - 前端通过 /api/auth/* 路由与后端交互，cookie 由服务端管理
 * - 用户信息缓存在 React Context 中
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""

export interface AuthUser {
  id: string
  email: string
  name: string | null
}

export interface LoginResponse {
  user: AuthUser
  organizationId: string
}

/**
 * 登录
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || "登录失败")
  }
  return data
}

/**
 * 注册
 */
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || "注册失败")
  }
  return data
}

/**
 * 登出
 */
export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, { method: "POST" })
}

/**
 * 获取当前用户
 */
export async function fetchCurrentUser(): Promise<{ user: AuthUser; organizationId: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
