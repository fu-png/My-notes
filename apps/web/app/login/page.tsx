"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { IconLoader2, IconMail, IconLock, IconUser } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login, register } from "@/lib/auth"
import { useAuth } from "@/lib/auth-context"

export default function LoginPage() {
  const router = useRouter()
  const { refresh } = useAuth()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      if (mode === "login") {
        await login(email, password)
      } else {
        await register(email, password, name || undefined)
      }
      await refresh()
      // 使用硬跳转而非 router.push，确保 middleware 能正确读取新设置的 cookie
      const params = new URLSearchParams(window.location.search)
      const redirect = params.get("redirect") || "/docs/projects"
      window.location.href = redirect
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh">
      {/* 左侧装饰区 */}
      <div className="hidden w-1/2 flex-col justify-between bg-black p-12 text-white lg:flex">
        <div>
          <Image
            src="/logo.png"
            alt="MyNotes"
            width={120}
            height={36}
            className="h-7 w-auto invert"
            priority
          />
        </div>
        <div>
          <blockquote className="max-w-lg">
            <p
              className="text-3xl font-normal leading-snug"
              style={{
                fontFamily: "var(--font-serif), serif",
                letterSpacing: "-1px",
              }}
            >
              <em className="text-neutral-400" style={{ fontStyle: "italic" }}>
                记录每一刻
              </em>
              思考的轨迹
            </p>
            <p className="mt-4 text-sm text-neutral-500">
              AI 驱动的个人笔记与知识管理平台
            </p>
          </blockquote>
        </div>
        <p className="text-xs text-neutral-600">
          &copy; {new Date().getFullYear()} MyNotes
        </p>
      </div>

      {/* 右侧表单区 */}
      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          {/* Logo (移动端) */}
          <div className="mb-8 lg:hidden">
            <Image
              src="/logo.png"
              alt="MyNotes"
              width={120}
              height={36}
              className="h-7 w-auto dark:invert"
              priority
            />
          </div>

          <h1 className="mb-2 text-2xl font-medium tracking-tight text-black dark:text-white">
            {mode === "login" ? "登录" : "创建账号"}
          </h1>
          <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
            {mode === "login"
              ? "输入你的邮箱和密码登录"
              : "注册一个新账号开始使用"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">昵称</Label>
                <div className="relative">
                  <IconUser className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="你的名字"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="relative">
                <IconMail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <IconLock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder={mode === "register" ? "至少 8 位" : "输入密码"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  className="pl-10"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : mode === "login" ? (
                "登录"
              ) : (
                "注册"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {mode === "login" ? (
              <>
                还没有账号？{" "}
                <button
                  onClick={() => { setMode("register"); setError("") }}
                  className="text-black underline underline-offset-4 hover:text-neutral-800 dark:text-white dark:hover:text-neutral-200"
                >
                  注册
                </button>
              </>
            ) : (
              <>
                已有账号？{" "}
                <button
                  onClick={() => { setMode("login"); setError("") }}
                  className="text-black underline underline-offset-4 hover:text-neutral-800 dark:text-white dark:hover:text-neutral-200"
                >
                  登录
                </button>
              </>
            )}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="text-xs text-neutral-400 transition-colors hover:text-black dark:hover:text-white"
            >
              &larr; 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
