"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconPlus,
  IconTrash,
  IconLoader2,
  IconFileText,
  IconNotebook,
  IconLayoutGrid,
  IconList,
  IconSortAscending,
  IconSortDescending,
  IconCalendar,
  IconAlphabetLatin,
  IconFiles,
  IconEdit,
  IconCheck,
  IconX,
  IconClock,
  IconArrowRight,
} from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useToast } from "@/hooks/use-toast"
import { ToastContainer } from "@/components/toast-container"
import { IconSearch } from "@tabler/icons-react"

interface Project {
  id: string
  name: string
  createdAt: string
  fileCount: number
}

type SortField = "createdAt" | "name" | "fileCount"
type SortOrder = "asc" | "desc"
type ViewMode = "grid" | "list"

const SORT_OPTIONS: { field: SortField; label: string; icon: React.ReactNode }[] = [
  { field: "createdAt", label: "创建时间", icon: <IconCalendar className="size-4" /> },
  { field: "name", label: "名称", icon: <IconAlphabetLatin className="size-4" /> },
  { field: "fileCount", label: "文档数量", icon: <IconFiles className="size-4" /> },
]

export function ProjectsList() {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const [projects, setProjects] = React.useState<Project[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // 搜索、排序、视图状态
  const [search, setSearch] = React.useState("")
  const [sortField, setSortField] = React.useState<SortField>("createdAt")
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc")
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid")

  const fetchProjects = React.useCallback(async () => {
    try {
      const res = await fetch("/api/projects")
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (err) {
      console.error("[fetchProjects] Failed:", err)
      setProjects([])
      showToast("error", "加载笔记列表失败，请刷新重试")
    } finally {
      setLoading(false)
    }
  }, [showToast])

  React.useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeleteTarget(null)
    setDeleting(id)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id))
        router.refresh()
      }
    } catch (err) {
      console.error("[handleDelete] Failed:", err)
      showToast("error", "删除失败，请重试")
    } finally {
      setDeleting(null)
    }
  }

  const startEditing = (project: Project) => {
    setEditingId(project.id)
    setEditName(project.name)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName("")
  }

  const handleRename = async () => {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, name: editName.trim() } : p))
        )
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast("error", data.error || "重命名失败，请重试")
      }
    } catch (err) {
      console.error("[handleRename] Failed:", err)
      showToast("error", "网络错误，重命名失败")
    } finally {
      setSaving(false)
      setEditingId(null)
      setEditName("")
    }
  }

  // 过滤 + 排序
  const filteredProjects = React.useMemo(() => {
    let result = projects

    // 搜索过滤
    if (search.trim()) {
      const keyword = search.trim().toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(keyword))
    }

    // 排序
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "zh-CN")
      } else if (sortField === "fileCount") {
        cmp = a.fileCount - b.fileCount
      }
      return sortOrder === "asc" ? cmp : -cmp
    })

    return result
  }, [projects, search, sortField, sortOrder])

  const currentSortOption = SORT_OPTIONS.find((o) => o.field === sortField)

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  const getRelativeTime = (dateStr: string) => {
    const now = Date.now()
    const date = new Date(dateStr).getTime()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return "刚刚"
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 30) return `${days} 天前`
    return formatDate(dateStr)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
      {/* Page header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">我的笔记</h1>
          <p className="text-sm text-muted-foreground">
            管理你的读书笔记与项目文档
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索笔记..."
              className="h-9 w-40 pl-8 text-sm sm:w-52"
              aria-label="搜索笔记"
            />
          </div>
          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default" className="shrink-0 gap-1.5">
                {sortOrder === "asc" ? (
                  <IconSortAscending className="size-3.5" />
                ) : (
                  <IconSortDescending className="size-3.5" />
                )}
                <span className="hidden sm:inline">{currentSortOption?.label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.field}
                  onClick={() => {
                    if (sortField === option.field) {
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                    } else {
                      setSortField(option.field)
                      setSortOrder("desc")
                    }
                  }}
                  className="gap-2"
                >
                  {option.icon}
                  {option.label}
                  {sortField === option.field && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
            className="shrink-0"
          >
            <ToggleGroupItem value="grid" aria-label="网格视图" className="px-2">
              <IconLayoutGrid className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="列表视图" className="px-2">
              <IconList className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button asChild size="default">
            <Link href="/docs/projects/new">
              <IconPlus className="size-4" data-icon="inline-start" />
              新建笔记
            </Link>
          </Button>
        </div>
      </div>

      {/* Notes content */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          加载中...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex size-16 items-center justify-center border border-dashed border-muted-foreground/30">
            <IconNotebook className="size-8 text-muted-foreground/40" />
          </div>
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            {search.trim() ? "没有找到匹配的笔记" : "开始记录你的想法"}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {search.trim() ? "试试其他关键词" : "点击右上角按钮创建第一本笔记"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid view */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="group relative border-l-2 border-l-transparent transition-all hover:border-l-primary hover:shadow-md"
            >
              <Link
                href={`/docs/projects/${encodeURIComponent(project.id)}`}
                className="absolute inset-0 z-10"
              />
              <CardHeader className="pb-3">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <div className="flex size-7 shrink-0 items-center justify-center bg-muted">
                    <IconNotebook className="size-4 text-muted-foreground" />
                  </div>
                  {editingId === project.id ? (
                    <div className="relative z-20 flex min-w-0 flex-1 items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === "Enter") handleRename()
                          if (e.key === "Escape") cancelEditing()
                        }}
                        className="h-7 text-sm"
                        autoFocus
                        disabled={saving}
                      />
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRename() }}
                        disabled={saving || !editName.trim()}
                        className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                      >
                        {saving ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCheck className="size-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelEditing() }}
                        disabled={saving}
                        className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                      >
                        <IconX className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="block truncate">{project.name}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <IconFileText className="size-3" />
                    {project.fileCount} 篇
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconClock className="size-3" />
                    {getRelativeTime(project.createdAt)}
                  </span>
                </div>
                <div className="relative z-20 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            startEditing(project)
                          }}
                          className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
                          aria-label={`重命名「${project.name}」`}
                        >
                          <IconEdit className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>重命名</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDeleteTarget({ id: project.id, name: project.name })
                          }}
                          disabled={deleting === project.id}
                          className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:outline-none"
                          aria-label={`删除「${project.name}」`}
                        >
                          {deleting === project.id ? (
                            <IconLoader2 className="size-3.5 animate-spin" />
                          ) : (
                            <IconTrash className="size-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>删除</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List view */
        <div className="divide-y divide-border border">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="group relative flex items-center gap-4 border-l-2 border-l-transparent px-4 py-3 transition-all hover:border-l-primary hover:bg-muted/50"
            >
              <Link
                href={`/docs/projects/${encodeURIComponent(project.id)}`}
                className="absolute inset-0 z-10"
              />
              <div className="flex size-7 shrink-0 items-center justify-center bg-muted">
                <IconNotebook className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                {editingId === project.id ? (
                  <div className="relative z-20 flex items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === "Enter") handleRename()
                        if (e.key === "Escape") cancelEditing()
                      }}
                      className="h-7 text-sm"
                      autoFocus
                      disabled={saving}
                    />
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRename() }}
                      disabled={saving || !editName.trim()}
                      className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {saving ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCheck className="size-3.5" />}
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelEditing() }}
                      disabled={saving}
                      className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <IconX className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="truncate text-sm font-medium">{project.name}</div>
                )}
              </div>
              <Badge variant="secondary" className="gap-1 font-normal">
                <IconFileText className="size-3" />
                {project.fileCount} 篇
              </Badge>
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                <IconClock className="size-3" />
                {getRelativeTime(project.createdAt)}
              </span>
              <div className="relative z-20 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    startEditing(project)
                  }}
                  className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
                  aria-label={`重命名「${project.name}」`}
                >
                  <IconEdit className="size-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDeleteTarget({ id: project.id, name: project.name })
                  }}
                  disabled={deleting === project.id}
                  className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:outline-none"
                  aria-label={`删除「${project.name}」`}
                >
                  {deleting === project.id ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconTrash className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results count */}
      {!loading && projects.length > 0 && (
        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {search.trim()
              ? `找到 ${filteredProjects.length} / ${projects.length} 个笔记`
              : `共 ${projects.length} 个笔记`}
          </span>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除笔记</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」及其所有文档吗？此操作不可撤销。
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

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}
