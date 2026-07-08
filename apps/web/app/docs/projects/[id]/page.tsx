import { NotebookWorkspace } from "@/components/notebook-workspace"
import { notFound } from "next/navigation"
import { fetchFromBackend } from "@/lib/api-proxy"
import { getJobByProjectId } from "@/lib/deep-research/job-store"

// 允许 Next.js prefetch 页面 shell（Link hover 预取），数据不缓存
export const revalidate = 0

interface ProjectDetail {
  project: { id: string; name: string; createdAt: string; fileCount?: number }
  files: { filename: string; title: string; lastModified: number }[]
  firstFileContent?: { filename: string; content: string; lastModified: number }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  try {
    const { data } = await fetchFromBackend<ProjectDetail>(`/projects/${id}`)
    if (!data) return { title: "笔记本" }
    return { title: data.project.name }
  } catch {
    return { title: "笔记本" }
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // 服务端预取文件列表 + 首文件内容，随 HTML 一起下发
  const { data } = await fetchFromBackend<ProjectDetail>(`/projects/${id}`)

  // 如果项目不存在但有正在运行的研究任务，允许加载页面（文件稍后生成）
  const hasActiveResearch = !!getJobByProjectId(id)
  if (!data && !hasActiveResearch) notFound()

  return (
    <NotebookWorkspace
      projectId={id}
      projectName={data?.project.name ?? "深度研究中…"}
      initialFiles={data?.files ?? []}
      initialFile={data?.firstFileContent?.filename ?? null}
      initialFileContent={data?.firstFileContent?.content ?? ""}
    />
  )
}
