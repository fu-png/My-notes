import fastifyJwt from "@fastify/jwt"
import fp from "fastify-plugin"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { loadEnv } from "../config/env.js"

export interface AccessTokenPayload {
  sub: string // userId
  organizationId: string
  type: "access" | "refresh"
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload
    user: AccessTokenPayload
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * JWT 鉴权插件 — 提供 fastify.authenticate 装饰器供路由 preHandler 使用
 * 仅负责校验 access token；refresh token 走独立的 /auth/refresh 路由手动验证
 */
export default fp(async function jwtPlugin(fastify: FastifyInstance) {
  const env = loadEnv()

  fastify.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  })

  fastify.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: "未授权：access token 无效或已过期" })
    }
  })
})
