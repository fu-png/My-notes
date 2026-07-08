import { PrismaClient } from "@prisma/client"
import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

/**
 * Prisma 插件 — 复用单例 PrismaClient，随 Fastify 生命周期关闭连接
 */
export default fp(async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = new PrismaClient({
    log: fastify.log.level === "debug" ? ["query", "error", "warn"] : ["error", "warn"],
  })

  await prisma.$connect()

  fastify.decorate("prisma", prisma)

  fastify.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect()
  })
})
