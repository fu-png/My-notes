import type { PrismaClient, Subscription } from "@prisma/client"

export class BillingError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = "BillingError"
  }
}

/**
 * 获取所有可用套餐
 */
export async function listPlans(prisma: PrismaClient) {
  return prisma.plan.findMany({
    orderBy: { priceInCents: "asc" },
  })
}

/**
 * 获取用户当前有效订阅
 */
export async function getActiveSubscription(
  prisma: PrismaClient,
  userId: string
): Promise<(Subscription & { plan: { code: string; name: string; features: unknown } }) | null> {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      currentEnd: { gt: new Date() },
    },
    include: {
      plan: {
        select: { code: true, name: true, features: true, priceInCents: true, billingPeriod: true },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as never
}

/**
 * 创建或升级订阅
 */
export async function createSubscription(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
  planCode: string
) {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } })
  if (!plan) {
    throw new BillingError("套餐不存在", 404)
  }

  // 检查是否已有该套餐的有效订阅
  const existing = await getActiveSubscription(prisma, userId)
  if (existing && (existing as { plan: { code: string } }).plan.code === planCode) {
    throw new BillingError("你已订阅该套餐", 409)
  }

  // 计算周期
  const now = new Date()
  const currentEnd = new Date(now)
  if (plan.billingPeriod === "year") {
    currentEnd.setFullYear(currentEnd.getFullYear() + 1)
  } else {
    currentEnd.setMonth(currentEnd.getMonth() + 1)
  }

  // 如果有旧的有效订阅，将其取消
  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: "CANCELED" },
    })
  }

  // 免费套餐直接激活，付费套餐创建 PENDING 订单
  if (plan.priceInCents === 0) {
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        organizationId,
        planId: plan.id,
        status: "ACTIVE",
        currentStart: now,
        currentEnd,
      },
      include: { plan: true },
    })
    return { subscription, order: null }
  }

  // 付费套餐：创建订阅 + 待支付订单
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      organizationId,
      planId: plan.id,
      status: "ACTIVE", // 简化版：直接激活。生产环境应等支付回调后激活。
      currentStart: now,
      currentEnd,
    },
    include: { plan: true },
  })

  const order = await prisma.order.create({
    data: {
      userId,
      subscriptionId: subscription.id,
      amountInCents: plan.priceInCents,
      currency: "CNY",
      status: "PAID", // 简化版：模拟已支付。
    },
  })

  return { subscription, order }
}

/**
 * 取消订阅（到期后不续费）
 */
export async function cancelSubscription(
  prisma: PrismaClient,
  userId: string,
  cancelAtEnd: boolean
) {
  const subscription = await getActiveSubscription(prisma, userId)
  if (!subscription) {
    throw new BillingError("没有有效订阅", 404)
  }

  if (cancelAtEnd) {
    // 标记为"到期后取消"
    return prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtEnd: true },
      include: { plan: true },
    })
  }

  // 立即取消
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "CANCELED" },
    include: { plan: true },
  })
}

/**
 * 获取用户订单历史
 */
export async function listOrders(prisma: PrismaClient, userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: {
      subscription: {
        include: { plan: { select: { name: true, code: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
}
