import type { FastifyInstance } from "fastify"
import { getAuthContext } from "../../lib/auth-context.js"
import { getMonthlyUsage, listRecentUsage, checkQuota } from "./usage.service.js"

export default async function usageRoutes(fastify: FastifyInstance) {
  /**
   * GET /usage/monthly — 当月用量汇总
   */
  fastify.get(
    "/usage/monthly",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { userId } = getAuthContext(request)
      const usage = await getMonthlyUsage(fastify.prisma, userId)
      return usage
    }
  )

  /**
   * GET /usage/recent — 最近用量记录
   */
  fastify.get(
    "/usage/recent",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { userId } = getAuthContext(request)
      const limit = Number((request.query as { limit?: string }).limit) || 50
      const records = await listRecentUsage(fastify.prisma, userId, limit)
      return { records }
    }
  )

  /**
   * GET /usage/quota — 配额检查
   */
  fastify.get(
    "/usage/quota",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { userId } = getAuthContext(request)
      const quota = await checkQuota(fastify.prisma, userId)
      return quota
    }
  )
}
