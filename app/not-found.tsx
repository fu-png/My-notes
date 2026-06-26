import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="mb-2 text-6xl font-bold tracking-tight text-muted-foreground/30">404</p>
      <h1 className="mb-3 text-xl font-semibold">页面未找到</h1>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        你访问的页面不存在或已被移动。
      </p>
      <Link
        href="/docs"
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        返回首页
      </Link>
    </div>
  )
}
