"use client"

import * as React from "react"
import {
  IconFilePlus,
  IconUpload,
  IconTrash,
  IconLoader2,
  IconChevronLeft,
  IconDotsVertical,
} from "@tabler/icons-react"
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
import type { DocFile } from "./types"
import { getFileIcon } from "./types"

// ─── Constants ───

const FILE_INPUT_ACCEPT = ".md,.txt,.json,.yaml,.yml,.csv,.tsv,.xml,.html,.htm,.js,.ts,.jsx,.tsx,.css,.py,.go,.java,.rs,.sh,.toml,.ini,.env,.log,.pdf,.docx,.xlsx,.pptx"

// ─── File Item (shared between desktop and mobile sidebar) ───

interface FileItemProps {
  file: DocFile
  isActive: boolean
  deleting: string | null
  onSelect: (filename: string) => void
  onDeleteRequest: (filename: string) => void
}

const FileItem = React.memo(function FileItem({
  file,
  isActive,
  deleting,
  onSelect,
  onDeleteRequest,
}: FileItemProps) {
  const isDeleting = deleting === file.filename

  return (
    <div
      className={`group flex items-center px-3 py-2 text-[13px] transition-colors ${
        isActive
          ? "border-l-2 border-primary bg-accent text-accent-foreground"
          : "border-l-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      <button
        onClick={() => onSelect(file.filename)}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {getFileIcon(file.filename)}
        <span className="truncate">{file.title}</span>
      </button>
      <div className="ml-1 w-0 shrink-0 overflow-hidden opacity-0 transition-all duration-150 group-hover:w-6 group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              disabled={isDeleting}
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

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="py-1">
          {loadingFiles ? (
            <div className="flex items-center justify-center py-12">
              <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
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
            files.map((file) => (
              <FileItem
                key={file.filename}
                file={file}
                isActive={activeFile === file.filename}
                deleting={deleting}
                onSelect={onSelectFile}
                onDeleteRequest={onDeleteRequest}
              />
            ))
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
  return (
    <>
      <div className="border-b px-3 py-2 text-left">
        <span className="text-sm font-medium">{projectName}</span>
      </div>
      <div className="h-[calc(100vh-4rem)] overflow-y-auto py-1">
        {files.map((file) => (
          <FileItem
            key={file.filename}
            file={file}
            isActive={activeFile === file.filename}
            deleting={deleting}
            onSelect={onSelectFile}
            onDeleteRequest={onDeleteRequest}
          />
        ))}
      </div>
    </>
  )
})
