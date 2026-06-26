import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "fallback-secret-for-dev-only"
)

const COOKIE_NAME = "session-token"

export interface Session {
  user: {
    id: string
    email: string
    name: string
  }
}

export async function createSession(user: Session["user"]) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(SECRET)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as Session
  } catch {
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function authenticate(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminEmail || !adminPassword) {
    return null
  }

  if (email === adminEmail && password === adminPassword) {
    return {
      id: "1",
      email: adminEmail,
      name: "Admin",
    }
  }

  return null
}
