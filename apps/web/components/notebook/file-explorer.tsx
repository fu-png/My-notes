"use client"

import * as React from "react"
import {
  IconFilePlus,
  IconUpload,
  IconTrash,
  IconLoader2,
  IconChevronLeft,
  IconGripVertical,
  IconFolder,
} from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { DocFile } from "./types"
import { getFileIcon } from "./types"

// ─── Constants ───

const FILE_INPUT_ACCEPT = ".md,.txt,.json,.yaml,.yml,.csv,.tsv,.xml,.html,.htm,.js,.ts,.jsx,.tsx,.css,.py,.go,.java,.rs,.sh,.toml,.ini,.env,.log,.pdf,.docx,.xlsx,.pptx"

// ─── Tree structure for subdirectories ───

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  file?: DocFile
  lastModified?: number
}

function buildFileTree(files: DocFile[], preserveOrder = false): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] }

  for (const file of files) {
    const parts = file.filename.split("/")
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const pathSoFar = parts.slice(0, i + 1).join("/")

      if (isLast) {
        // File node
        current.children.push({
          name: part,
          path: pathSoFar,
          isDir: false,
          children: [],
          file,
          lastModified: file.lastModified,
        })
      } else {
        // Directory node
        let dir = current.children.find((c) => c.isDir && c.name === part)
        if (!dir) {
          dir = {
            name: part,
            path: pathSoFar,
            isDir: true,
            children: [],
            lastModified: file.lastModified,
          }
          current.children.push(dir)
        }
        // Update directory lastModified to most recent child
        if (file.lastModified && (dir.lastModified || 0) < file.lastModified) {
          dir.lastModified = file.lastModified
        }
        current = dir
      }
    }
  }

  // 仅在有子目录时自动排序（目录优先 + 按时间降序）
  // 纯文件列表（无子目录）时保持 files 数组传入顺序，支持用户拖拽排序
  if (!preserveOrder) {
    function sortTree(node: TreeNode) {
      node.children.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1
        return (b.lastModified || 0) - (a.lastModified || 0)
      })
      node.children.forEach(sortTree)
    }
    sortTree(root)
  }

  return root
}

// ─── Directory Item ───

interface DirItemProps {
  node: TreeNode
  level: number
  activeFile: string | null
  deleting: string | null
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
  onSelectFile: (filename: string) => void
  onDeleteRequest: (filename: string) => void
}

const DirItem = React.memo(function DirItem({
  node,
  level,
  activeFile,
  deleting,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  onDeleteRequest,
}: DirItemProps) {
  if (!node.isDir) return null
  const isExpanded = expandedDirs.has(node.path)

  return (
    <div role="treeitem" aria-expanded={isExpanded} aria-selected={false} aria-level={level + 1}>
      <button
        onClick={() => onToggleDir(node.path)}
        aria-label={`${isExpanded ? "折叠" : "展开"}文件夹 ${node.name}`}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        style={{ paddingLeft: `${12 + level * 12}px` }}
      >
        <span className="text-[10px]">{isExpanded ? "▼" : "▶"}</span>
        <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded && (
        <div role="group">
          {node.children.map((child) =>
            child.isDir ? (
              <DirItem
                key={child.path}
                node={child}
                level={level + 1}
                activeFile={activeFile}
                deleting={deleting}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                onDeleteRequest={onDeleteRequest}
              />
            ) : child.file ? (
              <FileItem
                key={child.path}
                file={child.file}
                isActive={activeFile === child.file.filename}
                deleting={deleting}
                onSelect={onSelectFile}
                onDeleteRequest={onDeleteRequest}
                level={level + 1}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  )
})

// ─── File Item (shared between desktop and mobile sidebar) ───

interface FileItemProps {
  file: DocFile
  isActive: boolean
  deleting: string | null
  onSelect: (filename: string) => void
  onDeleteRequest: (filename: string) => void
  level?: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, filename: string) => void
  onDragOver?: (e: React.DragEvent, filename: string) => void
  onDragEnd?: () => void
  isDragOver?: boolean
}

const FileItem = React.memo(function FileItem({
  file,
  isActive,
  deleting,
  onSelect,
  onDeleteRequest,
  level = 0,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragOver = false,
}: FileItemProps) {
  const isDeleting = deleting === file.filename

  return (
    <div
      role="treeitem"
      aria-level={level + 1}
      aria-selected={isActive}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart?.(e, file.filename) : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); onDragOver?.(e, file.filename) } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`group flex items-center px-3 py-2 text-[13px] transition-colors ${
        isActive
          ? "border-l-2 border-primary bg-accent text-accent-foreground"
          : "border-l-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      } ${isDragOver ? "border-t-2 border-t-primary" : ""}`}
      style={{ paddingLeft: `${12 + level * 12}px` }}
    >
      {draggable && (
        <span className="-ml-2.5 mr-0 shrink-0 cursor-grab opacity-0 transition-opacity duration-150 group-hover:opacity-40 active:cursor-grabbing">
          <IconGripVertical className="size-3" />
        </span>
      )}
      <button
        onClick={() => onSelect(file.filename)}
        aria-label={`打开文件 ${file.title}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {getFileIcon(file.filename)}
        <span className="truncate">{file.title}</span>
      </button>
      <div className="ml-1 w-0 shrink-0 overflow-hidden opacity-0 transition-all duration-150 group-hover:w-6 group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteRequest(file.filename) }}
          disabled={isDeleting}
          aria-label={`删除文件 ${file.title}`}
          className="p-1 text-muted-foreground hover:text-destructive"
        >
          {isDeleting ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconTrash className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  )
})

// ─── Desktop File Explorer ───

export interface FileExplorerProps {
  projectName: string
  files: DocFile[]
  loadingFiles: boolean
  activeFile: string | null
  uploading: boolean
  isDragging: boolean
  deleting: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onBack: () => void
  onSelectFile: (filename: string) => void
  onDeleteRequest: (filename: string) => void
  onCreateFile: () => void
  onUploadClick: () => void
  onUpload: (files: FileList | File[]) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onReorderFiles?: (orderedFilenames: string[]) => void
  className?: string
  hideHeader?: boolean
  agentMode?: boolean
}

export const FileExplorer = React.memo(function FileExplorer({
  projectName,
  files,
  loadingFiles,
  activeFile,
  uploading,
  isDragging,
  deleting,
  fileInputRef,
  onBack,
  onSelectFile,
  onDeleteRequest,
  onCreateFile,
  onUploadClick,
  onUpload,
  onDragOver,
  onDragLeave,
  onDrop,
  onReorderFiles,
  className,
  hideHeader,
  agentMode,
}: FileExplorerProps) {
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(() => new Set())
  // 检查是否有子目录
  const hasSubdirs = React.useMemo(() => files.some(f => f.filename.includes("/")), [files])
  // 有子目录时自动排序，纯文件时保持 files 数组顺序（支持拖拽排序）
  const tree = React.useMemo(() => buildFileTree(files, !hasSubdirs), [files, hasSubdirs])

  // ─── Drag-to-reorder state ───
  const [dragSource, setDragSource] = React.useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = React.useState<string | null>(null)

  const rootFiles = React.useMemo(() => tree.children.filter(n => !n.isDir && n.file), [tree])

  const handleFileDragStart = React.useCallback((e: React.DragEvent, filename: string) => {
    setDragSource(filename)
    e.stopPropagation()
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/x-file-reorder", filename)
  }, [])

  const handleFileDragOver = React.useCallback((_e: React.DragEvent, filename: string) => {
    if (dragSource && dragSource !== filename) {
      setDragOverTarget(filename)
    }
  }, [dragSource])

  const handleFileDragEnd = React.useCallback(() => {
    if (dragSource && dragOverTarget && dragSource !== dragOverTarget && onReorderFiles) {
      const currentOrder = rootFiles.map(n => n.file!.filename)
      const fromIndex = currentOrder.indexOf(dragSource)
      const toIndex = currentOrder.indexOf(dragOverTarget)
      if (fromIndex !== -1 && toIndex !== -1) {
        const newOrder = [...currentOrder]
        const [moved] = newOrder.splice(fromIndex, 1)
        newOrder.splice(toIndex, 0, moved)
        onReorderFiles(newOrder)
      }
    }
    setDragSource(null)
    setDragOverTarget(null)
  }, [dragSource, dragOverTarget, rootFiles, onReorderFiles])

  const toggleDir = React.useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // 键盘导航：方向键在树节点之间移动
  const handleTreeKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const treeEl = e.currentTarget
    const items = Array.from(treeEl.querySelectorAll<HTMLElement>('[role="treeitem"]'))
    if (items.length === 0) return

    const currentIndex = items.findIndex((el) => el.contains(document.activeElement) || el === document.activeElement)

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault()
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0
        const btn = items[next].querySelector<HTMLElement>("button")
        ;(btn || items[next]).focus()
        break
      }
      case "ArrowUp": {
        e.preventDefault()
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1
        const btn = items[prev].querySelector<HTMLElement>("button")
        ;(btn || items[prev]).focus()
        break
      }
      case "Home": {
        e.preventDefault()
        const btn = items[0].querySelector<HTMLElement>("button")
        ;(btn || items[0]).focus()
        break
      }
      case "End": {
        e.preventDefault()
        const last = items[items.length - 1]
        const btn = last.querySelector<HTMLElement>("button")
        ;(btn || last).focus()
        break
      }
    }
  }, [])

  return (
    <div
      className={className ?? `relative hidden w-60 shrink-0 flex-col overflow-hidden border-r bg-muted/20 md:flex ${isDragging ? "ring-2 ring-inset ring-primary/50" : ""}`}
      onDragOver={(e) => {
        // 仅处理外部文件拖入（上传），排除内部文件排序拖拽
        if (e.dataTransfer.types.includes("text/x-file-reorder")) return
        onDragOver(e)
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types.includes("text/x-file-reorder")) return
        onDragLeave(e)
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("text/x-file-reorder")) return
        onDrop(e)
      }}
    >
      {/* Header */}
      {!hideHeader && (
        <div className="flex h-[49px] items-center justify-between border-b px-3">
          {agentMode ? (
            <span className="text-sm font-medium">文件列表</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-w-0 max-w-[140px] gap-1.5 px-1.5 text-sm font-medium text-foreground"
              onClick={onBack}
            >
              <IconChevronLeft className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{projectName}</span>
            </Button>
          )}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={onCreateFile}
                >
                  <IconFilePlus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">新建文件</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={onUploadClick}
                  disabled={uploading}
                >
                  {uploading ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconUpload className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">上传文件</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="py-1" role="tree" aria-label="文件列表" onKeyDown={handleTreeKeyDown}>
          {loadingFiles ? (
            <div className="space-y-1 px-3 py-2" role="status" aria-label="正在加载文件列表">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 py-2">
                  <Skeleton className="size-3.5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">
              {isDragging ? (
                <p className="font-medium text-primary">松开以上传文件</p>
              ) : (
                <>
                  <p>暂无文件</p>
                  <p className="mt-1 text-xs">新建或拖拽文件到此处</p>
                </>
              )}
            </div>
          ) : (
            <>
            {tree.children.map((node) =>
              node.isDir ? (
                <DirItem
                  key={node.path}
                  node={node}
                  level={0}
                  activeFile={activeFile}
                  deleting={deleting}
                  expandedDirs={expandedDirs}
                  onToggleDir={toggleDir}
                  onSelectFile={onSelectFile}
                  onDeleteRequest={onDeleteRequest}
                />
              ) : node.file ? (
                <FileItem
                  key={node.file.filename}
                  file={node.file}
                  isActive={activeFile === node.file.filename}
                  deleting={deleting}
                  onSelect={onSelectFile}
                  onDeleteRequest={onDeleteRequest}
                  level={0}
                  draggable={!hasSubdirs && !!onReorderFiles}
                  onDragStart={handleFileDragStart}
                  onDragOver={handleFileDragOver}
                  onDragEnd={handleFileDragEnd}
                  isDragOver={dragOverTarget === node.file.filename}
                />
              ) : null
            )}
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) onUpload(files)
          e.target.value = ""
        }}
        className="hidden"
      />

      {/* Drag overlay hint */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="border-2 border-dashed border-primary/50 px-8 py-5 text-sm font-medium text-primary">
            松开上传
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Mobile File List (for Sheet content) ───

export interface MobileFileListProps {
  projectName: string
  files: DocFile[]
  activeFile: string | null
  deleting: string | null
  onSelectFile: (filename: string) => void
  onDeleteRequest: (filename: string) => void
}

export const MobileFileList = React.memo(function MobileFileList({
  projectName,
  files,
  activeFile,
  deleting,
  onSelectFile,
  onDeleteRequest,
}: MobileFileListProps) {
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(() => new Set())
  const tree = React.useMemo(() => buildFileTree(files), [files])

  const toggleDir = React.useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  return (
    <>
      <div className="border-b px-3 py-2 text-left">
        <span className="text-sm font-medium">{projectName}</span>
      </div>
      <div className="h-[calc(100vh-4rem)] overflow-y-auto py-1">
        {tree.children.map((node) =>
          node.isDir ? (
            <DirItem
              key={node.path}
              node={node}
              level={0}
              activeFile={activeFile}
              deleting={deleting}
              expandedDirs={expandedDirs}
              onToggleDir={toggleDir}
              onSelectFile={onSelectFile}
              onDeleteRequest={onDeleteRequest}
            />
          ) : node.file ? (
            <FileItem
              key={node.file.filename}
              file={node.file}
              isActive={activeFile === node.file.filename}
              deleting={deleting}
              onSelect={onSelectFile}
              onDeleteRequest={onDeleteRequest}
              level={0}
            />
          ) : null
        )}
      </div>
    </>
  )
})
