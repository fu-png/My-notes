"use client"

import * as React from "react"
import {
  IconFilePlus,
  IconUpload,
  IconTrash,
  IconLoader2,
  IconChevronLeft,
  IconDotsVertical,
  IconFileText,
  IconFolder,
  IconSearch,
  IconX,
} from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { formatRelativeTime } from "@/lib/utils"
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

function buildFileTree(files: DocFile[]): TreeNode {
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

  // Sort: directories first, then by lastModified desc
  function sortTree(node: TreeNode) {
    node.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return (b.lastModified || 0) - (a.lastModified || 0)
    })
    node.children.forEach(sortTree)
  }
  sortTree(root)

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
    <div>
      <button
        onClick={() => onToggleDir(node.path)}
        aria-label={`${isExpanded ? "折叠" : "展开"}文件夹 ${node.name}`}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        style={{ paddingLeft: `${12 + level * 12}px` }}
      >
        <span className="text-[10px]">{isExpanded ? "▼" : "▶"}</span>
        <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded && (
        <div>
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
}

const FileItem = React.memo(function FileItem({
  file,
  isActive,
  deleting,
  onSelect,
  onDeleteRequest,
  level = 0,
}: FileItemProps) {
  const isDeleting = deleting === file.filename

  return (
    <div
      className={`group flex items-center px-3 py-2 text-[13px] transition-colors ${
        isActive
          ? "border-l-2 border-primary bg-accent text-accent-foreground"
          : "border-l-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
      style={{ paddingLeft: `${12 + level * 12}px` }}
    >
      <button
        onClick={() => onSelect(file.filename)}
        aria-label={`打开文件 ${file.title}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {getFileIcon(file.filename)}
        <div className="flex min-w-0 flex-col text-left">
          <span className="truncate">{file.title}</span>
          {file.lastModified ? (
            <p className="text-[10px] text-muted-foreground">
              {formatRelativeTime(file.lastModified)}
            </p>
          ) : null}
        </div>
      </button>
      <div className="ml-1 w-0 shrink-0 overflow-hidden opacity-0 transition-all duration-150 group-hover:w-6 group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              disabled={isDeleting}
              aria-label={`${file.title} 的更多操作`}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              {isDeleting ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconDotsVertical className="size-3.5" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={4}>
            <DropdownMenuItem
              onClick={() => onDeleteRequest(file.filename)}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash className="size-3.5" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  recentFiles?: string[]
  onBack: () => void
  onSelectFile: (filename: string) => void
  onDeleteRequest: (filename: string) => void
  onCreateFile: () => void
  onUploadClick: () => void
  onUpload: (files: FileList | File[]) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
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
  recentFiles,
  onBack,
  onSelectFile,
  onDeleteRequest,
  onCreateFile,
  onUploadClick,
  onUpload,
  onDragOver,
  onDragLeave,
  onDrop,
}: FileExplorerProps) {
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(() => new Set())
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredFiles = React.useMemo(() => {
    if (!searchQuery.trim()) return files
    const q = searchQuery.trim().toLowerCase()
    return files.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.filename.toLowerCase().includes(q)
    )
  }, [files, searchQuery])

  const tree = React.useMemo(() => buildFileTree(filteredFiles), [filteredFiles])
  const isSearching = searchQuery.trim().length > 0

  // When searching, auto-expand all directories so matching files in subdirs are visible
  const allDirPaths = React.useMemo(() => {
    if (!isSearching) return new Set<string>()
    const paths = new Set<string>()
    function collect(node: TreeNode) {
      if (node.isDir && node.path) {
        paths.add(node.path)
        node.children.forEach(collect)
      }
    }
    tree.children.forEach(collect)
    return paths
  }, [isSearching, tree])

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
    <div
      className={`relative hidden w-60 shrink-0 flex-col overflow-hidden border-r bg-muted/20 md:flex ${isDragging ? "ring-2 ring-inset ring-primary/50" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 min-w-0 max-w-[140px] gap-1.5 px-1.5 text-sm font-medium text-foreground"
          onClick={onBack}
        >
          <IconChevronLeft className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{projectName}</span>
        </Button>
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

      {/* Quick search */}
      {!loadingFiles && files.length > 3 && (
        <div className="border-b px-2.5 py-1.5">
          <div className="relative">
            <IconSearch className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文件..."
              aria-label="搜索文件"
              className="w-full rounded-none border-none bg-muted/50 py-1 pl-7 pr-6 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:bg-muted"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                aria-label="清除搜索"
              >
                <IconX className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="py-1">
          {loadingFiles ? (
            <div className="space-y-1 px-3 py-2">
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
          ) : isSearching && filteredFiles.length === 0 ? (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">
              <p>未找到匹配的文件</p>
              <p className="mt-1 text-xs">试试其他关键词</p>
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
            {recentFiles && recentFiles.length > 0 && !isSearching && (
            <div className="mb-3">
              <p className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-muted-foreground/60">
                最近打开
              </p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {recentFiles.map((filename) => {
                  const file = files.find((f) => f.filename === filename)
                  if (!file) return null
                  return (
                    <button
                      key={filename}
                      onClick={() => onSelectFile(filename)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                        activeFile === filename
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      <IconFileText className="size-3 shrink-0 text-muted-foreground" />
                      <span className="max-w-[120px] truncate">{file.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
            {isSearching && (
              <p className="mb-1 px-3 text-[11px] text-muted-foreground/60">
                找到 {filteredFiles.length} 个结果
              </p>
            )}
            {tree.children.map((node) =>
              node.isDir ? (
                <DirItem
                  key={node.path}
                  node={node}
                  level={0}
                  activeFile={activeFile}
                  deleting={deleting}
                  expandedDirs={isSearching ? allDirPaths : expandedDirs}
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
  recentFiles?: string[]
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
