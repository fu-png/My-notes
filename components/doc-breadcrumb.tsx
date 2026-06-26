"use client"

import { usePathname } from "next/navigation"
import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { docSections } from "@/lib/doc-sections"

// Derive slug→section and slug→title maps from the single source of truth
function getSidebarLabel(title: string): string {
  const partMatch = title.match(/^(Part \d+)\.\s*(.+?)(?:\s*—.*)?$/)
  if (partMatch) return `${partMatch[1]} · ${partMatch[2]}`
  if (title.includes("附录")) return "附录"
  return title
}

const slugToSection: Record<string, string> = {}
const slugToTitle: Record<string, string> = {}

for (const section of docSections) {
  const label = getSidebarLabel(section.title)
  for (const item of section.items) {
    slugToSection[item.slug] = label
    slugToTitle[item.slug] = item.title
  }
}

/** Fetch project name from API, with in-memory cache to avoid repeated requests */
const projectNameCache: Record<string, string> = {}

function useProjectName(projectId: string | null): string | null {
  const [name, setName] = React.useState<string | null>(
    projectId ? (projectNameCache[projectId] ?? null) : null
  )

  React.useEffect(() => {
    if (!projectId) return
    if (projectNameCache[projectId]) {
      setName(projectNameCache[projectId])
      return
    }
    fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.project?.name) {
          projectNameCache[projectId] = data.project.name
          setName(data.project.name)
        }
      })
      .catch(() => {/* silently ignore */})
  }, [projectId])

  return name
}

export function DocBreadcrumb() {
  const pathname = usePathname()
  const slug = pathname.replace("/docs/", "")

  // Determine if we're on a project page and extract projectId
  const isProjectPage = pathname.startsWith("/docs/projects/") &&
    pathname !== "/docs/projects/new"
  const projectId = isProjectPage
    ? decodeURIComponent(pathname.replace("/docs/projects/", "").split("/")[0])
    : null

  const projectName = useProjectName(projectId)

  if (pathname === "/docs") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>My Notes</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  // Handle dashboard page
  if (pathname === "/docs/dashboard") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>仪表盘</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  // Handle projects pages
  if (pathname === "/docs/projects") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>我的笔记</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (pathname === "/docs/projects/new") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs/projects">我的笔记</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>新建笔记</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (isProjectPage && projectId) {
    const parts = pathname.replace("/docs/projects/", "").split("/")
    const filename = parts[1] ? decodeURIComponent(parts[1]) : null
    const fileTitle = filename ? filename.replace(/\.md$/, "") : null
    const projectLabel = projectName ?? projectId

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs/projects">我的笔记</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          {fileTitle ? (
            <>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href={`/docs/projects/${encodeURIComponent(projectId)}`}>
                  {projectLabel}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{fileTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{projectLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  // Handle uploads pages
  if (pathname === "/docs/uploads") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>上传文档</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (pathname.startsWith("/docs/uploads/")) {
    const filename = decodeURIComponent(pathname.replace("/docs/uploads/", ""))
    const title = filename.replace(/\.md$/, "")
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/docs/uploads">上传文档</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  // Book content pages
  const section = slugToSection[slug]
  const title = slugToTitle[slug]

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/docs">My Notes</BreadcrumbLink>
        </BreadcrumbItem>
        {section && (
          <>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">
              <span className="text-muted-foreground">{section}</span>
            </BreadcrumbItem>
          </>
        )}
        {title && (
          <>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
