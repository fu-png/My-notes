import type { FastifyInstance } from "fastify"
import { loadEnv } from "../../config/env.js"
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema.js"
import { AuthError, registerUser, verifyCredentials } from "./auth.service.js"

/**
 * 签发 access + refresh 双 token。
 * refresh token 使用独立 secret 单独签名，避免用同一密钥签发的 token 被跨用途使用。
 */
async function issueTokenPair(
  fastify: FastifyInstance,
  payload: { sub: string; organizationId: string }
) {
  const env = loadEnv()

  const accessToken = await fastify.jwt.sign(
    { ...payload, type: "access" },
    { expiresIn: env.JWT_ACCESS_TTL }
  )
  const refreshToken = await fastify.jwt.sign(
    { ...payload, type: "refresh" },
    { key: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_TTL }
  )

  return { accessToken, refreshToken }
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
    }

    try {
      const { user, organizationId } = await registerUser(fastify.prisma, parsed.data)
      const tokens = await issueTokenPair(fastify, { sub: user.id, organizationId })
      return reply.code(201).send({
        user: { id: user.id, email: user.email, name: user.name },
        organizationId,
        ...tokens,
      })
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message })
      }
      throw err
    }
  })

  fastify.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
    }

    try {
      const { user, organizationId } = await verifyCredentials(fastify.prisma, parsed.data)
      const tokens = await issueTokenPair(fastify, { sub: user.id, organizationId })
      return reply.send({
        user: { id: user.id, email: user.email, name: user.name },
        organizationId,
        ...tokens,
      })
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message })
      }
      throw err
    }
  })

  fastify.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
    }

    const env = loadEnv()
    try {
      const decoded = fastify.jwt.verify<{ sub: string; organizationId: string; type: string }>(
        parsed.data.refreshToken,
        { key: env.JWT_REFRESH_SECRET }
      )
      if (decoded.type !== "refresh") {
        return reply.code(401).send({ error: "无效的 refresh token" })
      }
      const tokens = await issueTokenPair(fastify, {
        sub: decoded.sub,
        organizationId: decoded.organizationId,
      })
      return reply.send(tokens)
    } catch {
      return reply.code(401).send({ error: "refresh token 无效或已过期，请重新登录" })
    }
  })

  fastify.get("/auth/me", { preHandler: fastify.authenticate }, async (request) => {
    const { sub, organizationId } = request.user
    const user = await fastify.prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, email: true, name: true, createdAt: true },
    })
    return { user, organizationId }
  })
}
