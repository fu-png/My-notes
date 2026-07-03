"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconFile, IconTrash, IconLoader2 } from "@tabler/icons-react"
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
import { useToast } from "@/hooks/use-toast"
import { ToastContainer } from "@/components/toast-container"

interface UploadedFile {
  filename: string
  title: string
}

export function UploadedFilesList({ basePath = "/docs/uploads" }: { basePath?: string }) {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const [files, setFiles] = React.useState<UploadedFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState("")
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    fetch("/api/uploads")
      .then((res) => res.json())
      .then((data) => {
        if (active) {
          setFiles(data.files || [])
          setLoadError("")
        }
      })
      .catch(() => {
        if (active) {
          setFiles([])
          setLoadError("加载失败，请刷新重试")
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleDelete = async (filename: string) => {
    setDeleteTarget(null)
    setDeleting(filename)
    try {
      const res = await fetch(
        `/api/uploads/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.filename !== filename))
        router.refresh()
      } else {
        showToast("error", "删除失败，请重试")
      }
    } catch {
      showToast("error", "网络错误，删除失败")
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
      <p className={`py-8 text-center text-sm ${loadError ? "text-destructive" : "text-muted-foreground"}`}>
        {loadError || "暂无上传的文档"}
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
            onClick={() => setDeleteTarget(file.filename)}
            disabled={deleting === file.filename}
            aria-label="删除"
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 &ldquo;{deleteTarget}&rdquo; 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}
