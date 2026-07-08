"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/auth-context"
import {
  IconCheck,
  IconLoader2,
  IconArrowLeft,
  IconCrown,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"

interface Plan {
  id: string
  code: string
  name: string
  priceInCents: number
  billingPeriod: string
  features: {
    maxProjects?: number
    monthlyTokenQuota?: number
    monthlyStorageQuotaMB?: number
    deepResearch?: boolean
    pptGeneration?: boolean
    audioGeneration?: boolean
    prioritySupport?: boolean
    teamCollaboration?: boolean
    [key: string]: unknown
  }
}

const planIcons: Record<string, typeof IconCrown> = {
  free: IconSparkles,
  pro: IconCrown,
  team: IconUsers,
}

const planColors: Record<string, string> = {
  free: "text-neutral-500",
  pro: "text-amber-500",
  team: "text-blue-500",
}

function formatQuota(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`
  return tokens.toString()
}

export default function PricingPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [currentPlanCode, setCurrentPlanCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const plansRes = await fetch("/api/billing/plans")
        const plansData = await plansRes.json()
        setPlans(plansData.plans ?? [])

        if (isAuthenticated) {
          const subRes = await fetch("/api/billing/subscription")
          const subData = await subRes.json()
          setCurrentPlanCode(subData.subscription?.plan?.code ?? null)
        }
      } catch (err) {
        console.error("Failed to load plans:", err)
      } finally {
        setIsLoading(false)
      }
    }
    if (!authLoading) load()
  }, [isAuthenticated, authLoading])

  const handleSubscribe = async (planCode: string) => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/pricing`)
      return
    }

    setSubscribing(planCode)
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "订阅失败")
        return
      }
      setCurrentPlanCode(planCode)
      router.push("/dashboard")
    } catch {
      alert("订阅失败，请重试")
    } finally {
      setSubscribing(null)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <IconLoader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-white dark:bg-neutral-950">
      {/* 导航 */}
      <nav className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="MyNotes"
              width={100}
              height={30}
              className="h-6 w-auto dark:invert"
            />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button variant="outline" size="sm">账户</Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm">登录</Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 标题 */}
      <div className="px-6 py-16 text-center">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-black dark:hover:text-white"
        >
          <IconArrowLeft className="size-3" /> 返回首页
        </Link>
        <h1
          className="mb-3 text-4xl font-normal tracking-tight text-black dark:text-white sm:text-5xl"
          style={{ fontFamily: "var(--font-serif), serif" }}
        >
          选择适合你的<em className="text-[#999]" style={{ fontStyle: "italic" }}>套餐</em>
        </h1>
        <p className="mx-auto max-w-xl text-base text-neutral-500 dark:text-neutral-400">
          从免费版开始，按需升级。所有套餐都包含 AI 智能对话和笔记管理核心功能。
        </p>
      </div>

      {/* 套餐卡片 */}
      <div className="mx-auto max-w-5xl px-6 pb-20">
        <div className={`grid gap-6 ${plans.length === 3 ? "lg:grid-cols-3" : plans.length === 2 ? "lg:grid-cols-2" : ""} sm:grid-cols-1`}>
          {plans.map((plan) => {
            const Icon = planIcons[plan.code] ?? IconSparkles
            const colorClass = planColors[plan.code] ?? "text-neutral-500"
            const isCurrent = currentPlanCode === plan.code
            const isPopular = plan.code === "pro"

            return (
              <Card
                key={plan.id}
                className={`relative transition-all ${isPopular ? "border-black shadow-lg dark:border-white" : ""}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    最受欢迎
                  </Badge>
                )}
                <CardHeader className="text-center">
                  <div className={`mx-auto mb-2 flex size-12 items-center justify-center bg-neutral-100 dark:bg-neutral-800 ${colorClass}`}>
                    <Icon className="size-6" strokeWidth={1.5} />
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>
                    {plan.priceInCents === 0 ? (
                      <span className="text-3xl font-medium text-black dark:text-white">免费</span>
                    ) : (
                      <>
                        <span className="text-3xl font-medium text-black dark:text-white">
                          ¥{(plan.priceInCents / 100).toFixed(0)}
                        </span>
                        <span className="text-neutral-400">
                          /{plan.billingPeriod === "year" ? "年" : "月"}
                        </span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Separator />

                  <ul className="space-y-2.5 text-sm">
                    {plan.features.maxProjects != null && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>最多 {plan.features.maxProjects === -1 ? "无限" : plan.features.maxProjects} 个项目</span>
                      </li>
                    )}
                    {plan.features.monthlyTokenQuota != null && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>每月 {formatQuota(plan.features.monthlyTokenQuota)} tokens</span>
                      </li>
                    )}
                    {plan.features.monthlyStorageQuotaMB != null && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>{plan.features.monthlyStorageQuotaMB >= 1024 ? `${(plan.features.monthlyStorageQuotaMB / 1024).toFixed(0)} GB` : `${plan.features.monthlyStorageQuotaMB} MB`} 存储空间</span>
                      </li>
                    )}
                    {plan.features.deepResearch && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>深度研究</span>
                      </li>
                    )}
                    {plan.features.pptGeneration && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>PPT 智能生成</span>
                      </li>
                    )}
                    {plan.features.audioGeneration && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>音频内容生成</span>
                      </li>
                    )}
                    {plan.features.prioritySupport && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>优先客服支持</span>
                      </li>
                    )}
                    {plan.features.teamCollaboration && (
                      <li className="flex items-center gap-2">
                        <IconCheck className="size-4 shrink-0 text-green-500" />
                        <span>团队协作</span>
                      </li>
                    )}
                  </ul>

                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    disabled={isCurrent || !!subscribing}
                    onClick={() => handleSubscribe(plan.code)}
                  >
                    {subscribing === plan.code ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : isCurrent ? (
                      "当前套餐"
                    ) : plan.priceInCents === 0 ? (
                      "免费开始"
                    ) : (
                      "立即订阅"
                    )}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {plans.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-neutral-400">暂无可用套餐</p>
          </div>
        )}
      </div>
    </div>
  )
}
