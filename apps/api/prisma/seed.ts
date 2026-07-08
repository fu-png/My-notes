/**
 * 数据库种子脚本 — 初始化 Plan 套餐数据
 *
 * 使用方法: npx tsx prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const plans = [
  {
    code: "free",
    name: "免费版",
    priceInCents: 0,
    billingPeriod: "month",
    features: {
      maxProjects: 5,
      monthlyTokenQuota: 50_000,
      monthlyStorageQuotaMB: 100,
      deepResearch: true,
      pptGeneration: false,
      audioGeneration: false,
      prioritySupport: false,
      teamCollaboration: false,
    },
  },
  {
    code: "pro",
    name: "Pro 专业版",
    priceInCents: 2900, // ¥29/月
    billingPeriod: "month",
    features: {
      maxProjects: -1, // 无限
      monthlyTokenQuota: 500_000,
      monthlyStorageQuotaMB: 5120, // 5GB
      deepResearch: true,
      pptGeneration: true,
      audioGeneration: true,
      prioritySupport: true,
      teamCollaboration: false,
    },
  },
  {
    code: "team",
    name: "Team 团队版",
    priceInCents: 9900, // ¥99/月
    billingPeriod: "month",
    features: {
      maxProjects: -1,
      monthlyTokenQuota: 2_000_000,
      monthlyStorageQuotaMB: 51200, // 50GB
      deepResearch: true,
      pptGeneration: true,
      audioGeneration: true,
      prioritySupport: true,
      teamCollaboration: true,
    },
  },
]

async function main() {
  console.log("Seeding plans...")

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceInCents: plan.priceInCents,
        billingPeriod: plan.billingPeriod,
        features: plan.features,
      },
      create: plan,
    })
    console.log(`  ✓ ${plan.code}: ${plan.name} (¥${(plan.priceInCents / 100).toFixed(0)}/${plan.billingPeriod})`)
  }

  console.log("Seeding complete!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
