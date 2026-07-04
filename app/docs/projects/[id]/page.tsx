import { NotebookWorkspace } from "@/components/notebook-workspace"
import { notFound } from "next/navigation"
import { readFile } from "@/lib/storage"

// 允许 Next.js prefetch 页面 shell（Link hover 预取），数据不缓存
export const revalidate = 0

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

  // 只读取 meta.json 验证项目存在 + 获取名称，文件列表和内容由客户端加载
  // 这样页面可以快速返回，避免服务端 N 次 OSS 请求阻塞导航
  const metaContent = await readFile(`projects/${id}/meta.json`)
  if (!metaContent) notFound()

  let projectName = "笔记本"
  try {
    const meta = JSON.parse(metaContent)
    projectName = meta.name || projectName
  } catch { /* ignore */ }

  return (
    <NotebookWorkspace
      projectId={id}
      projectName={projectName}
    />
  )
}
