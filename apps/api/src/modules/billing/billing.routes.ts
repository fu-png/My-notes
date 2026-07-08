import type { FastifyInstance } from "fastify"
import { getAuthContext } from "../../lib/auth-context.js"
import { createSubscriptionSchema, cancelSubscriptionSchema } from "./billing.schema.js"
import {
  BillingError,
  listPlans,
  getActiveSubscription,
  createSubscription,
  cancelSubscription,
  listOrders,
} from "./billing.service.js"

export default async function billingRoutes(fastify: FastifyInstance) {
  /**
   * GET /billing/plans — 获取所有套餐（公开接口）
   */
  fastify.get("/billing/plans", async () => {
    const plans = await listPlans(fastify.prisma)
    return { plans }
  })

  /**
   * GET /billing/subscription — 获取当前用户的有效订阅
   */
  fastify.get(
    "/billing/subscription",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { userId } = getAuthContext(request)
      const subscription = await getActiveSubscription(fastify.prisma, userId)
      return { subscription }
    }
  )

  /**
   * POST /billing/subscribe — 创建/切换订阅
   */
  fastify.post(
    "/billing/subscribe",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const parsed = createSubscriptionSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
      }

      try {
        const { userId, organizationId } = getAuthContext(request)
        const result = await createSubscription(
          fastify.prisma,
          userId,
          organizationId,
          parsed.data.planCode
        )
        return reply.code(201).send(result)
      } catch (err) {
        if (err instanceof BillingError) {
          return reply.code(err.statusCode).send({ error: err.message })
        }
        throw err
      }
    }
  )

  /**
   * POST /billing/cancel — 取消订阅
   */
  fastify.post(
    "/billing/cancel",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const parsed = cancelSubscriptionSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
      }

      try {
        const { userId } = getAuthContext(request)
        const subscription = await cancelSubscription(
          fastify.prisma,
          userId,
          parsed.data.cancelAtEnd
        )
        return reply.send({ subscription })
      } catch (err) {
        if (err instanceof BillingError) {
          return reply.code(err.statusCode).send({ error: err.message })
        }
        throw err
      }
    }
  )

  /**
   * GET /billing/orders — 获取用户的订单历史
   */
  fastify.get(
    "/billing/orders",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { userId } = getAuthContext(request)
      const orders = await listOrders(fastify.prisma, userId)
      return { orders }
    }
  )
}
