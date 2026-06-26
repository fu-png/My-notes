import { NotebookWorkspace } from "@/components/notebook-workspace"
import { notFound } from "next/navigation"
import { readFile } from "@/lib/storage"

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

  const metaContent = await readFile(`projects/${id}/meta.json`)
  if (!metaContent) notFound()

  let meta: { id: string; name: string; createdAt: string }
  try {
    meta = JSON.parse(metaContent)
  } catch {
    notFound()
  }

  return <NotebookWorkspace projectId={id} projectName={meta.name} />
}
