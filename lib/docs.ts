import fs from "fs"
import path from "path"

// Re-export the pure data and types so existing server-side imports still work
export { docSections } from "./doc-sections"
export type { DocItem, DocSection } from "./doc-sections"

import { docSections } from "./doc-sections"
import type { DocItem, DocSection } from "./doc-sections"

export function getDocBySlug(slug: string): DocItem | undefined {
  for (const section of docSections) {
    const item = section.items.find((i) => i.slug === slug)
    if (item) return item
  }
  return undefined
}

export function getDocContent(slug: string): string | null {
  const doc = getDocBySlug(slug)
  if (!doc) return null
  const fullPath = path.join(process.cwd(), doc.filePath)
  try {
    return fs.readFileSync(fullPath, "utf-8")
  } catch {
    return null
  }
}

export function getSectionBySlug(slug: string): DocSection | undefined {
  for (const section of docSections) {
    if (section.items.some((i) => i.slug === slug)) {
      return section
    }
  }
  return undefined
}

export function getAllSlugs(): string[] {
  return docSections.flatMap((s) => s.items.map((i) => i.slug))
}

export function getAdjacentDocs(slug: string): {
  prev: DocItem | null
  next: DocItem | null
} {
  const allItems = docSections.flatMap((s) => s.items)
  const idx = allItems.findIndex((i) => i.slug === slug)
  return {
    prev: idx > 0 ? allItems[idx - 1] : null,
    next: idx < allItems.length - 1 ? allItems[idx + 1] : null,
  }
}
