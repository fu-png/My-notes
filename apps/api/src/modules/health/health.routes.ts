import type { FastifyInstance } from "fastify"

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() }
  })

  fastify.get("/health/db", async (_request, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`
      return { status: "ok", database: "connected" }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(503).send({ status: "error", database: "unreachable" })
    }
  })
}
