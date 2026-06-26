import { signIn } from "@/auth"
import { redirect } from "next/navigation"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-sm space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">欢迎回来</h1>
          <p className="text-sm text-muted-foreground">
            登录以访问你的笔记
          </p>
        </div>

        <form
          action={async (formData: FormData) => {
            "use server"
            const result = await signIn("credentials", {
              email: formData.get("email") as string,
              password: formData.get("password") as string,
              redirect: false,
            })

            if (result?.error) {
              redirect("/login?error=invalid")
            }
            redirect("/docs/projects")
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-medium leading-none"
            >
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium leading-none"
            >
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            登录
          </button>
        </form>
      </div>
    </div>
  )
}
