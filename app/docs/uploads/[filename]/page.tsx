import { notFound } from "next/navigation"
import { readFile } from "@/lib/storage"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import Link from "next/link"
import { IconChevronLeft } from "@tabler/icons-react"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ filename: string }>
}) {
  const { filename } = await params
  const decoded = decodeURIComponent(filename)
  const title = decoded.replace(/\.md$/, "")
  return {
    title,
  }
}

export default async function UploadedDocPage({
  params,
}: {
  params: Promise<{ filename: string }>
}) {
  const { filename } = await params
  const decoded = decodeURIComponent(filename)

  const content = await readFile(`uploads/${decoded}`)
  if (content === null) notFound()

  const title = decoded.replace(/\.md$/, "")

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-8 lg:px-10">
      <div className="mb-6">
        <Link
          href="/docs/uploads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronLeft className="size-3.5" />
          返回上传文档
        </Link>
      </div>

      <MarkdownRenderer content={content} />

      <nav className="mt-12 border-t pt-6">
        <Link
          href="/docs/uploads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronLeft className="size-3.5" />
          返回上传文档列表
        </Link>
      </nav>
    </div>
  )
}
