import { notFound } from "next/navigation"
import { fetchFromBackend } from "@/lib/api-proxy"
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

interface FileResponse {
  content: string
  filename: string
  lastModified?: number
}

interface ProjectDetail {
  project: { id: string; name: string }
  files: unknown[]
}

export default async function ProjectFilePage({
  params,
}: {
  params: Promise<{ id: string; filename: string }>
}) {
  const { id, filename } = await params
  const decoded = decodeURIComponent(filename)

  // 从后端获取文件内容
  const { data: fileData } = await fetchFromBackend<FileResponse>(
    `/projects/${id}/files/${encodeURIComponent(decoded)}`
  )
  if (!fileData?.content && fileData?.content !== "") notFound()

  // 获取项目名
  let projectName = id
  try {
    const { data: projectData } = await fetchFromBackend<ProjectDetail>(`/projects/${id}`)
    if (projectData?.project?.name) {
      projectName = projectData.project.name
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

      <MarkdownRenderer content={fileData.content} />

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
