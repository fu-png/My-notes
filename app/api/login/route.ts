import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { SignJWT } = await import("jose")

    const body = await request.json()
    const { email, password } = body

    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "env_missing", detail: "ADMIN_EMAIL or ADMIN_PASSWORD not set" },
        { status: 500 }
      )
    }

    if (email !== adminEmail || password !== adminPassword) {
      return NextResponse.json({ error: "invalid" }, { status: 401 })
    }

    const secret = process.env.AUTH_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: "env_missing", detail: "AUTH_SECRET not set" },
        { status: 500 }
      )
    }

    const secretKey = new TextEncoder().encode(secret)
    const user = { id: "1", email: adminEmail, name: "Admin" }

    const token = await new SignJWT({ user })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(secretKey)

    const response = NextResponse.json({ success: true })
    response.cookies.set("session-token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const stack = err instanceof Error ? err.stack : ""
    return NextResponse.json(
      { error: "internal", message, stack },
      { status: 500 }
    )
  }
}
