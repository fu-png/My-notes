"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconUpload, IconFile, IconX, IconCheck, IconLoader2 } from "@tabler/icons-react"

interface UploadedFile {
  filename: string
  title: string
}

export function FileUpload({ redirectBase = "/docs/uploads" }: { redirectBase?: string }) {
  const router = useRouter()
  const [isDragging, setIsDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [result, setResult] = React.useState<{
    success: boolean
    message: string
    file?: UploadedFile
  } | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".md")) {
      setResult({ success: false, message: "仅支持 .md 格式的 Markdown 文件" })
      return
    }

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setResult({
          success: true,
          message: `"${data.title}" 上传成功`,
          file: data,
        })
        router.refresh()
      } else {
        setResult({ success: false, message: data.error || "上传失败" })
      }
    } catch {
      setResult({ success: false, message: "网络错误，上传失败" })
    } finally {
      setUploading(false)
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
    // Reset input so same file can be uploaded again
    e.target.value = ""
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        {uploading ? (
          <IconLoader2 className="mb-3 size-10 animate-spin text-primary" />
        ) : (
          <IconUpload className="mb-3 size-10 text-muted-foreground" />
        )}
        <p className="mb-1 text-sm font-medium">
          {uploading ? "正在上传..." : "拖拽文件到此处，或点击选择"}
        </p>
        <p className="text-xs text-muted-foreground">仅支持 .md 格式</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Result message */}
      {result && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            result.success
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {result.success ? (
            <IconCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <IconX className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="flex-1">
            <p>{result.message}</p>
            {result.success && result.file && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(
                    `${redirectBase}/${encodeURIComponent(result.file!.filename)}`
                  )
                }}
                className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:no-underline"
              >
                <IconFile className="size-3" />
                立即阅读
              </button>
            )}
          </div>
          <button
            onClick={() => setResult(null)}
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
