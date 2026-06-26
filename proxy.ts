import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"

export async function proxy(request: NextRequest) {
  const session = await auth()

  const { pathname } = request.nextUrl

  // 已登录用户访问登录页时重定向到主页
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/docs/projects", request.url))
  }

  // 未登录用户重定向到登录页
  if (!session && pathname !== "/login") {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，但排除：
     * - api/auth (认证 API 路由)
     * - _next/static (静态资源)
     * - _next/image (图片优化)
     * - favicon.ico, logo.png (公共文件)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|logo.png).*)",
  ],
}
