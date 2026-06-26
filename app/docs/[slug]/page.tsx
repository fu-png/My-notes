import { notFound } from "next/navigation"
import { getDocBySlug, getDocContent, getAdjacentDocs, getAllSlugs } from "@/lib/docs"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import Link from "next/link"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) return { title: "未找到" }
  return {
    title: doc.title,
  }
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) notFound()

  const content = getDocContent(slug)
  if (!content) notFound()

  const { prev, next } = getAdjacentDocs(slug)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-8 lg:px-10">
      <MarkdownRenderer content={content} />

      {/* Previous / Next navigation */}
      <nav className="mt-12 flex items-center justify-between border-t pt-6">
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            <div className="flex flex-col items-start">
              <span className="text-xs text-muted-foreground">上一章</span>
              <span className="font-medium text-foreground">{prev.title}</span>
            </div>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">下一章</span>
              <span className="font-medium text-foreground">{next.title}</span>
            </div>
            <IconChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div />
        )}
      </nav>
    </div>
  )
}
