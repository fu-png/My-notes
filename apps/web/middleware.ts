import { NextRequest, NextResponse } from "next/server"

/**
 * Next.js Middleware — 路由保护
 *
 * 受保护路由（/docs/*、/dashboard/*）要求用户已登录。
 * 判断依据：cookie 中是否存在 access_token 或 refresh_token。
 * 真正的 token 校验在 API route 层完成，这里只做快速重定向。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const accessToken = request.cookies.get("access_token")?.value
  const refreshToken = request.cookies.get("refresh_token")?.value
  const isAuthenticated = !!(accessToken || refreshToken)

  // 已登录用户访问登录页 → 重定向到项目页
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/docs/projects", request.url))
  }

  // 未登录用户访问受保护路由 → 重定向到登录页
  const protectedPaths = ["/docs", "/dashboard"]
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/docs/:path*", "/dashboard/:path*", "/login"],
}
