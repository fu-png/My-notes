"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconFile, IconTrash, IconLoader2 } from "@tabler/icons-react"

interface UploadedFile {
  filename: string
  title: string
}

export function UploadedFilesList({ basePath = "/docs/uploads" }: { basePath?: string }) {
  const router = useRouter()
  const [files, setFiles] = React.useState<UploadedFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  const fetchFiles = React.useCallback(async () => {
    try {
      const res = await fetch("/api/uploads")
      const data = await res.json()
      setFiles(data.files || [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleDelete = async (filename: string) => {
    if (!confirm(`确定要删除 "${filename}" 吗？`)) return

    setDeleting(filename)
    try {
      const res = await fetch(
        `/api/uploads/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.filename !== filename))
        router.refresh()
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <IconLoader2 className="size-4 animate-spin" />
        加载中...
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        暂无上传的文档
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <div
          key={file.filename}
          className="group flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-muted"
        >
          <Link
            href={`${basePath}/${encodeURIComponent(file.filename)}`}
            className="flex min-w-0 flex-1 items-center gap-2 text-sm"
          >
            <IconFile className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.title}</span>
          </Link>
          <button
            onClick={() => handleDelete(file.filename)}
            disabled={deleting === file.filename}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
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
  )
}
