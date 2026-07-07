import { NotebookWorkspace } from "@/components/notebook-workspace"
import { notFound } from "next/navigation"
import { getProject } from "@/lib/storage"
import { getJobByProjectId } from "@/lib/deep-research/job-store"

// 允许 Next.js prefetch 页面 shell（Link hover 预取），数据不缓存
export const revalidate = 0

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  try {
    if (!project) return { title: "笔记本" }
    return { title: project.meta.name }
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
  const project = await getProject(id)

  // 如果项目不存在但有正在运行的研究任务，允许加载页面（文件稍后生成）
  const hasActiveResearch = !!getJobByProjectId(id)
  if (!project && !hasActiveResearch) notFound()

  return (
    <NotebookWorkspace
      projectId={id}
      projectName={project?.meta.name ?? "深度研究中…"}
      initialFiles={project?.files ?? []}
      initialFile={project?.firstFileContent?.filename ?? null}
      initialFileContent={project?.firstFileContent?.content ?? ""}
    />
  )
}
