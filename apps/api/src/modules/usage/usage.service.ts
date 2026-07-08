import type { PrismaClient, UsageFeature } from "@prisma/client"

/**
 * 记录一次 AI 调用的用量
 */
export async function recordUsage(
  prisma: PrismaClient,
  data: {
    userId: string
    feature: UsageFeature
    model: string
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    costInCents?: number
  }
) {
  return prisma.usageRecord.create({
    data: {
      userId: data.userId,
      feature: data.feature,
      model: data.model,
      promptTokens: data.promptTokens ?? 0,
      completionTokens: data.completionTokens ?? 0,
      totalTokens: data.totalTokens ?? 0,
      costInCents: data.costInCents ?? 0,
    },
  })
}

/**
 * 获取用户当月用量汇总
 */
export async function getMonthlyUsage(prisma: PrismaClient, userId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const records = await prisma.usageRecord.groupBy({
    by: ["feature"],
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _sum: {
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      costInCents: true,
    },
    _count: true,
  })

  // 本月总计
  const totals = await prisma.usageRecord.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _sum: {
      totalTokens: true,
      costInCents: true,
    },
    _count: true,
  })

  return {
    period: {
      start: startOfMonth.toISOString(),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
    },
    byFeature: records.map((r) => ({
      feature: r.feature,
      count: r._count,
      totalTokens: r._sum.totalTokens ?? 0,
      costInCents: r._sum.costInCents ?? 0,
    })),
    totals: {
      count: totals._count,
      totalTokens: totals._sum.totalTokens ?? 0,
      costInCents: totals._sum.costInCents ?? 0,
    },
  }
}

/**
 * 获取用户最近的用量记录
 */
export async function listRecentUsage(
  prisma: PrismaClient,
  userId: string,
  limit = 50
) {
  return prisma.usageRecord.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

/**
 * 检查用户是否超出配额
 * 根据用户订阅的 Plan.features.monthlyTokenQuota 进行检查
 */
export async function checkQuota(
  prisma: PrismaClient,
  userId: string
): Promise<{ allowed: boolean; used: number; quota: number }> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // 获取用户当前订阅的配额
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      currentEnd: { gt: now },
    },
    include: { plan: true },
  })

  // 默认免费配额 50,000 tokens/月
  const features = (subscription?.plan?.features ?? { monthlyTokenQuota: 50_000 }) as {
    monthlyTokenQuota?: number
  }
  const quota = features.monthlyTokenQuota ?? 50_000

  // 查询本月已使用的 token 数
  const usage = await prisma.usageRecord.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _sum: { totalTokens: true },
  })

  const used = usage._sum.totalTokens ?? 0
  return { allowed: used < quota, used, quota }
}
