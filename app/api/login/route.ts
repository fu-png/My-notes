import { authenticate, createSession } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password } = body

  const user = await authenticate(email, password)

  if (!user) {
    return NextResponse.json({ error: "invalid" }, { status: 401 })
  }

  await createSession(user)
  return NextResponse.json({ success: true })
}
