"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useAuth } from "@/lib/auth-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  IconCrown,
  IconReceipt,
  IconChartBar,
  IconUser,
  IconLogout,
  IconArrowRight,
  IconArrowLeft,
  IconFileText,
  IconLoader2,
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface PlanInfo {
  code: string
  name: string
  features: Record<string, unknown>
  priceInCents: number
  billingPeriod: string
}

interface SubscriptionInfo {
  id: string
  status: string
  currentStart: string
  currentEnd: string
  cancelAtEnd: boolean
  plan: PlanInfo
}

interface UsageInfo {
  period: { start: string; end: string }
  byFeature: { feature: string; count: number; totalTokens: number; costInCents: number }[]
  totals: { count: number; totalTokens: number; costInCents: number }
}

interface OrderInfo {
  id: string
  amountInCents: number
  currency: string
  status: string
  createdAt: string
  subscription: { plan: { name: string; code: string } } | null
}

const featureLabels: Record<string, string> = {
  DEEP_RESEARCH: "深度研究",
  RAG_CHAT: "RAG 对话",
  PPT_GENERATION: "PPT 生成",
  OTHER: "其他",
}

export default function DashboardPage() {
  const { user, logout, isLoading: authLoading } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [orders, setOrders] = useState<OrderInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [subRes, usageRes, ordersRes] = await Promise.all([
          fetch("/api/billing/subscription"),
          fetch("/api/billing/usage"),
          fetch("/api/billing/orders"),
        ])
        const subData = await subRes.json()
        const usageData = await usageRes.json()
        const ordersData = await ordersRes.json()

        setSubscription(subData.subscription ?? null)
        setUsage(usageData)
        setOrders(ordersData.orders ?? [])
      } catch (err) {
        console.error("Failed to load dashboard data:", err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <IconLoader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const quota = (subscription?.plan?.features as { monthlyTokenQuota?: number })?.monthlyTokenQuota ?? 50_000
  const usedTokens = usage?.totals?.totalTokens ?? 0
  const usagePercent = Math.min(100, Math.round((usedTokens / quota) * 100))

  return (
    <div className="min-h-svh bg-white dark:bg-neutral-950">
      {/* 顶部导航 */}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex size-8 items-center justify-center rounded-full bg-black text-xs text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black">
                  {(user?.name || user?.email || "U")[0].toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">{user?.name || "用户"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="cursor-pointer">
                    <IconUser className="mr-2 size-4" />账户设置
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/docs/projects" className="cursor-pointer">
                    <IconFileText className="mr-2 size-4" />我的项目
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                >
                  <IconLogout className="mr-2 size-4" />退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* 返回按钮 */}
        <button
          onClick={() => window.history.back()}
          className="mb-6 flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-black dark:hover:text-white"
        >
          <IconArrowLeft className="size-4" />
          返回
        </button>

        {/* 用户信息 */}
        <div className="mb-10">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center bg-neutral-100 dark:bg-neutral-800">
              <IconUser className="size-6 text-neutral-500" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-black dark:text-white">
                {user?.name || user?.email}
              </h1>
              <p className="text-sm text-neutral-500">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 当前订阅 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconCrown className="size-5 text-amber-500" />
                当前订阅
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-medium text-black dark:text-white">
                        {subscription.plan.name}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {subscription.plan.priceInCents === 0
                          ? "免费"
                          : `¥${(subscription.plan.priceInCents / 100).toFixed(0)}/${subscription.plan.billingPeriod === "year" ? "年" : "月"}`}
                      </p>
                    </div>
                    <Badge
                      variant={subscription.status === "ACTIVE" ? "default" : "secondary"}
                    >
                      {subscription.status === "ACTIVE" ? "生效中" : subscription.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-neutral-400">
                    有效期至 {new Date(subscription.currentEnd).toLocaleDateString("zh-CN")}
                    {subscription.cancelAtEnd && " (到期后不续费)"}
                  </p>
                  <Link href="/pricing">
                    <Button variant="outline" size="sm" className="w-full">
                      升级套餐 <IconArrowRight className="size-3" />
                    </Button>
                  </Link>
                </>
              ) : (
                <div className="text-center">
                  <p className="mb-3 text-sm text-neutral-500">暂无订阅</p>
                  <Link href="/pricing">
                    <Button size="sm">
                      查看套餐 <IconArrowRight className="size-3" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 本月用量 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconChartBar className="size-5 text-blue-500" />
                本月用量
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-neutral-500">Token 使用量</span>
                  <span className="text-black dark:text-white">
                    {usedTokens.toLocaleString()} / {quota.toLocaleString()}
                  </span>
                </div>
                <Progress value={usagePercent} className="h-2" />
              </div>
              <div className="text-xs text-neutral-400">
                本月调用 {usage?.totals?.count ?? 0} 次
              </div>
              {usage?.byFeature && usage.byFeature.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  {usage.byFeature.map((f) => (
                    <div key={f.feature} className="flex justify-between text-sm">
                      <span className="text-neutral-500">
                        {featureLabels[f.feature] ?? f.feature}
                      </span>
                      <span className="text-black dark:text-white">
                        {f.totalTokens.toLocaleString()} tokens ({f.count} 次)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 订单历史 */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconReceipt className="size-5 text-green-500" />
                订单历史
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-center text-sm text-neutral-400 py-6">暂无订单</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between border-b border-neutral-100 pb-3 last:border-0 dark:border-neutral-800"
                    >
                      <div>
                        <p className="text-sm text-black dark:text-white">
                          {order.subscription?.plan?.name ?? "订单"}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black dark:text-white">
                          ¥{(order.amountInCents / 100).toFixed(2)}
                        </span>
                        <Badge
                          variant={order.status === "PAID" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {order.status === "PAID"
                            ? "已支付"
                            : order.status === "PENDING"
                              ? "待支付"
                              : order.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
