import { NotebookWorkspace } from "@/components/notebook-workspace"
import { notFound } from "next/navigation"
import { readFile, getProject } from "@/lib/storage"

// 禁止缓存，确保每次进入都读取最新的项目名称
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const metaContent = await readFile(`projects/${id}/meta.json`)
  try {
    if (!metaContent) return { title: "笔记本" }
    const meta = JSON.parse(metaContent)
    return { title: meta.name }
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

  // 服务端一次性获取 meta + 文件列表，避免客户端二次请求
  const projectData = await getProject(id)
  if (!projectData) notFound()

  const { meta, files: initialFiles } = projectData

  // 预取第一个文件内容，消除客户端串行瀑布流
  const initialFile = initialFiles[0]?.filename ?? null
  let initialFileContent = ""
  if (initialFile) {
    initialFileContent = await readFile(`projects/${id}/${initialFile}`) ?? ""
  }

  return (
    <NotebookWorkspace
      projectId={id}
      projectName={meta.name}
      initialFiles={initialFiles}
      initialFile={initialFile}
      initialFileContent={initialFileContent}
    />
  )
}
