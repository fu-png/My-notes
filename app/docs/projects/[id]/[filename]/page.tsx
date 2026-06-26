import { notFound } from "next/navigation"
import { readFile } from "@/lib/storage"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import Link from "next/link"
import { IconChevronLeft } from "@tabler/icons-react"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; filename: string }>
}) {
  const { filename } = await params
  const title = decodeURIComponent(filename).replace(/\.md$/, "")
  return { title }
}

export default async function ProjectFilePage({
  params,
}: {
  params: Promise<{ id: string; filename: string }>
}) {
  const { id, filename } = await params
  const decoded = decodeURIComponent(filename)

  const content = await readFile(`projects/${id}/${decoded}`)
  if (content === null) notFound()

  // 获取项目名
  let projectName = id
  try {
    const metaContent = await readFile(`projects/${id}/meta.json`)
    if (metaContent) {
      const meta = JSON.parse(metaContent)
      projectName = meta.name
    }
  } catch {
    // 使用默认项目名
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-8 lg:px-10">
      <div className="mb-6">
        <Link
          href={`/docs/projects/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronLeft className="size-3.5" />
          返回{projectName}
        </Link>
      </div>

      <MarkdownRenderer content={content} />

      <nav className="mt-12 border-t pt-6">
        <Link
          href={`/docs/projects/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronLeft className="size-3.5" />
          返回{projectName}
        </Link>
      </nav>
    </div>
  )
}
