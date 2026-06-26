import { signIn } from "@/auth"
import { IconBrandGithub } from "@tabler/icons-react"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-sm space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">欢迎回来</h1>
          <p className="text-sm text-muted-foreground">
            使用 GitHub 账号登录以访问你的笔记
          </p>
        </div>

        <form
          action={async () => {
            "use server"
            await signIn("github", { redirectTo: "/docs/projects" })
          }}
        >
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <IconBrandGithub className="size-5" />
            使用 GitHub 登录
          </button>
        </form>
      </div>
    </div>
  )
}
