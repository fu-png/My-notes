import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "fallback-secret-for-dev-only"
)

async function verifySession(request: NextRequest) {
  const token = request.cookies.get("session-token")?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await verifySession(request)

  // 已登录用户访问登录页时重定向到主页
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/docs/projects", request.url))
  }

  // 未登录用户访问受保护路径时重定向到登录页
  if (!session && pathname.startsWith("/docs")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png).*)",
  ],
}
