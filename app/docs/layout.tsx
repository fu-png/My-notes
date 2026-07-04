import { TopNav } from "@/components/app-sidebar"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <TopNav />
      <main id="main-content" className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
