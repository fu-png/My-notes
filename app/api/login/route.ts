import { authenticate, createSessionToken, getSessionCookieOptions } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password } = body

  const user = await authenticate(email, password)

  if (!user) {
    return NextResponse.json({ error: "invalid" }, { status: 401 })
  }

  const token = await createSessionToken(user)
  const cookieOptions = getSessionCookieOptions()

  const response = NextResponse.json({ success: true })
  response.cookies.set(cookieOptions.name, token, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  })

  return response
}
