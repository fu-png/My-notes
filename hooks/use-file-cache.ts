import * as React from "react"

interface CachedFile {
  content: string
  editContent: string
  fetchedAt: number
  lastModified: number
}

interface UseFileCacheParams {
  projectId: string
  /** Max age in ms before a cached entry is considered stale (default: 60_000 = 60s) */
  maxAge?: number
  /** Max number of files to cache in memory (default: 20) */
  maxEntries?: number
}

interface UseFileCacheReturn {
  /**
   * Load file content with SWR semantics:
   * - If cached & fresh → return instantly, no fetch
   * - If cached & stale → return cache immediately, fetch in background to refresh
   * - If not cached → fetch and return
   */
  loadFileContent: (filename: string) => Promise<void>
  /** Current file content (for active file) */
  fileContent: string
  /** Current edit content (for active file) */
  editContent: string
  setEditContent: React.Dispatch<React.SetStateAction<string>>
  /** Whether a fresh fetch is in progress */
  loadingContent: boolean
  /** Set content directly (e.g., after save, translate, doc-update) */
  setFileContent: (filename: string, content: string) => void
  /** Invalidate a specific cached file (e.g., after external modification) */
  invalidate: (filename: string) => void
  /** Clear entire cache (e.g., on project switch) */
  clearCache: () => void
}

export function useFileCache({
  projectId,
  maxAge = 60_000,
  maxEntries = 20,
}: UseFileCacheParams): UseFileCacheReturn {
  const cacheRef = React.useRef<Map<string, CachedFile>>(new Map())
  const [fileContent, setFileContentState] = React.useState("")
  const [editContent, setEditContent] = React.useState("")
  const [loadingContent, setLoadingContent] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const activeFileRef = React.useRef<string | null>(null)

  // Clear cache when projectId changes
  React.useEffect(() => {
    cacheRef.current.clear()
  }, [projectId])

  const evictIfNeeded = React.useCallback(() => {
    const cache = cacheRef.current
    if (cache.size <= maxEntries) return
    // Evict oldest entry by fetchedAt
    let oldestKey = ""
    let oldestTime = Infinity
    for (const [key, entry] of cache) {
      if (entry.fetchedAt < oldestTime) {
        oldestTime = entry.fetchedAt
        oldestKey = key
      }
    }
    if (oldestKey) cache.delete(oldestKey)
  }, [maxEntries])

  const fetchFile = React.useCallback(
    async (
      filename: string,
      signal?: AbortSignal
    ): Promise<{ content: string; lastModified: number } | null> => {
      try {
        // filename may contain / for subdirectories, e.g. "folder/file.md"
        // We encode each path segment individually for the catch-all route
        const url = `/api/projects/${encodeURIComponent(projectId)}/files/${filename
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`
        const res = await fetch(url, { signal })
        if (!res.ok) return null
        const data = await res.json()
        return { content: data.content || "", lastModified: data.lastModified || Date.now() }
      } catch {
        return null
      }
    },
    [projectId]
  )

  const loadFileContent = React.useCallback(
    async (filename: string) => {
      // Cancel any in-flight request for a previous file
      if (abortRef.current) {
        abortRef.current.abort()
      }
      activeFileRef.current = filename

      const cache = cacheRef.current
      const cached = cache.get(filename)
      const now = Date.now()

      if (cached) {
        // Serve from cache immediately — no flicker
        setFileContentState(cached.content)
        setEditContent(cached.editContent)

        if (now - cached.fetchedAt < maxAge) {
          // Fresh cache — no refetch needed
          setLoadingContent(false)
          return
        }

        // Stale cache — show cached content but refetch in background
        const controller = new AbortController()
        abortRef.current = controller

        // Background refresh (no loading indicator since we already have content)
        fetchFile(filename, controller.signal).then((result) => {
          if (result !== null && activeFileRef.current === filename) {
            const existing = cache.get(filename)
            if (existing && existing.lastModified === result.lastModified) {
              // 文件未变更，只更新 fetchedAt
              existing.fetchedAt = Date.now()
              cache.set(filename, existing)
            } else {
              // 文件已变更，更新内容
              const entry: CachedFile = {
                content: result.content,
                editContent: result.content,
                fetchedAt: Date.now(),
                lastModified: result.lastModified,
              }
              cache.set(filename, entry)
              setFileContentState(result.content)
              setEditContent(result.content)
            }
          }
        })
        return
      }

      // Not cached — full fetch with loading state
      setLoadingContent(true)
      setFileContentState("")
      setEditContent("")

      const controller = new AbortController()
      abortRef.current = controller

      const content = await fetchFile(filename, controller.signal)

      // Only apply if this is still the active file (user didn't switch away)
      if (activeFileRef.current === filename && content !== null) {
        const entry: CachedFile = {
          content: content.content,
          editContent: content.content,
          fetchedAt: Date.now(),
          lastModified: content.lastModified,
        }
        cache.set(filename, entry)
        evictIfNeeded()
        setFileContentState(content.content)
        setEditContent(content.content)
      }

      if (activeFileRef.current === filename) {
        setLoadingContent(false)
      }
    },
    [maxAge, fetchFile, evictIfNeeded]
  )

  const setFileContent = React.useCallback(
    (filename: string, content: string) => {
      const cache = cacheRef.current
      const existing = cache.get(filename)
      const entry: CachedFile = {
        content,
        editContent: content,
        fetchedAt: Date.now(),
        lastModified: existing?.lastModified || Date.now(),
      }
      cache.set(filename, entry)
      if (activeFileRef.current === filename) {
        setFileContentState(content)
        setEditContent(content)
      }
    },
    []
  )

  const invalidate = React.useCallback((filename: string) => {
    cacheRef.current.delete(filename)
  }, [])

  const clearCache = React.useCallback(() => {
    cacheRef.current.clear()
  }, [])

  return {
    loadFileContent,
    fileContent,
    editContent,
    setEditContent,
    loadingContent,
    setFileContent,
    invalidate,
    clearCache,
  }
}
