"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconChevronLeft,
  IconFile,
  IconTrash,
  IconLoader2,
  IconUpload,
  IconX,
  IconCheck,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface DocFile {
  filename: string
  title: string
}

interface ProjectDetailProps {
  projectId: string
  projectName: string
}

export function ProjectDetail({ projectId, projectName }: ProjectDetailProps) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [files, setFiles] = React.useState<DocFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [uploadResult, setUploadResult] = React.useState<{
    success: boolean
    message: string
    filename?: string
  } | null>(null)

  const fetchFiles = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setFiles(data.files || [])
      setLoadError(false)
    } catch {
      setFiles([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    queueMicrotask(() => fetchFiles())
  }, [fetchFiles])

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".md")) {
      setUploadResult({ success: false, message: "仅支持 .md 格式的 Markdown 文件" })
      return
    }

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files`,
        { method: "POST", body: formData }
      )
      const data = await res.json()

      if (res.ok && data.success) {
        setUploadResult({
          success: true,
          message: `"${data.title}" 上传成功`,
          filename: data.filename,
        })
        await fetchFiles()
        router.refresh()
      } else {
        setUploadResult({ success: false, message: data.error || "上传失败" })
      }
    } catch {
      setUploadResult({ success: false, message: "网络错误，上传失败" })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const filename = deleteTarget
    setDeleteTarget(null)
    setDeleting(filename)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files/${filename
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.filename !== filename))
        router.refresh()
      }
    } catch {
      alert("删除失败，请重试")
    } finally {
      setDeleting(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ""
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 md:px-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/docs/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronLeft className="size-3.5" />
          返回我的笔记
        </Link>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">{projectName}</h1>
        <p className="text-sm text-muted-foreground">
          {loading ? "加载中..." : `${files.length} 个文档`}
        </p>
      </div>

      {/* Upload zone */}
      <div className="mb-8">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="点击或拖拽上传 Markdown 文件"
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          {uploading ? (
            <IconLoader2 className="mb-2 size-8 animate-spin text-primary" />
          ) : (
            <IconUpload className="mb-2 size-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {uploading ? "正在上传..." : "拖拽文件到此处，或点击选择"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">仅支持 .md 格式</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              uploadResult.success
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {uploadResult.success ? (
              <IconCheck className="mt-0.5 size-4 shrink-0" />
            ) : (
              <IconX className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="flex-1">
              <p>{uploadResult.message}</p>
              {uploadResult.success && uploadResult.filename && (
                <Link
                  href={`/docs/projects/${encodeURIComponent(projectId)}/${uploadResult.filename!
                    .split("/")
                    .map((s) => encodeURIComponent(s))
                    .join("/")}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:no-underline"
                >
                  <IconFile className="size-3" />
                  立即阅读
                </Link>
              )}
            </div>
            <button
              onClick={() => setUploadResult(null)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* File list */}
      <div>
        <h2 className="mb-3 text-base font-semibold">文档列表</h2>
{loading ? (
<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
<IconLoader2 className="size-4 animate-spin" />
加载中...
</div>
) : loadError ? (
<p className="py-10 text-center text-sm text-destructive">
文件列表加载失败，请刷新页面重试
</p>
) : files.length === 0 ? (
<p className="py-10 text-center text-sm text-muted-foreground">
还没有文档，上传第一个 .md 文件开始吧
</p>
) : (
          <div className="space-y-1">
            {files.map((file) => (
              <div
                key={file.filename}
                className="group flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <Link
                  href={`/docs/projects/${encodeURIComponent(projectId)}/${file.filename
                    .split("/")
                    .map((s) => encodeURIComponent(s))
                    .join("/")}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                >
                  <IconFile className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.title}</span>
                </Link>
                <button
                  onClick={() => setDeleteTarget(file.filename)}
                  disabled={deleting === file.filename}
                  className="ml-2 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  title="删除"
                >
                  {deleting === file.filename ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconTrash className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文档</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.replace(/\.md$/, "")}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
