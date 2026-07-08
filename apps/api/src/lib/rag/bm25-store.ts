/**
 * BM25 全文搜索层（MiniSearch 封装）
 *
 * 使用 MiniSearch 构建内存中的 BM25 倒排索引
 * 索引序列化为 JSON，通过 lib/storage.ts 持久化到 .rag/bm25.json
 *
 * 迁移说明：从 apps/web/lib/rag/bm25-store.ts 迁移而来。
 * 所有导出函数新增 userId 参数，存储路径从 `projects/{projectId}/.rag/...`
 * 改为 `users/{userId}/projects/{projectId}/.rag/...`，实现多租户数据隔离。
 *
 * 自定义 tokenizer 支持中英文混合文本：
 * - 英文按空格/标点分词（默认行为）
 * - 中文使用 bigram 分词（2 字一组滑窗）
 */

import MiniSearch from "minisearch"
import type { Chunk, SearchResult } from "./types.js"
import { readFile, readFileBuffer, writeFile as storageWrite, deleteFile as storageDelete } from "../storage.js"
import { userProjectPrefix } from "../storage.js"
import { loadChunksData } from "./vector-store.js"
import { gzip, gunzip } from "node:zlib"
import { promisify } from "node:util"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// 内存缓存：避免每次搜索都从存储读取和反序列化
const bm25Cache = new Map<string, { index: MiniSearch<MiniSearchDoc>; loadedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

// ─── 中英文混合分词器（统一实现） ───

import { tokenize as cjkTokenize } from "./tokenizer.js"

// MiniSearch 配置
const MINISEARCH_OPTIONS = {
  fields: ["content", "fileTitle", "headings"] as string[],
  storeFields: ["filename", "fileTitle", "headings"] as string[],
  idField: "id" as const,
  tokenize: cjkTokenize,
  searchOptions: {
    boost: { content: 1, fileTitle: 1.5, headings: 1.2 },
    fuzzy: 0.2,
    prefix: true,
    tokenize: cjkTokenize,
  },
}

type MiniSearchDoc = {
  id: string
  content: string
  fileTitle: string
  headings: string
  filename: string
}

function cacheKey(userId: string, projectId: string): string {
  return `${userId}/${projectId}`
}

function getBm25Path(userId: string, projectId: string): string {
  return `${userProjectPrefix(userId, projectId)}.rag/bm25.json`
}

/** 从 chunks 构建 MiniSearch 索引 */
function buildIndex(chunks: Chunk[]): MiniSearch<MiniSearchDoc> {
  const ms = new MiniSearch<MiniSearchDoc>(MINISEARCH_OPTIONS)

  const docs: MiniSearchDoc[] = chunks.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    fileTitle: chunk.fileTitle,
    headings: chunk.headingPath.join(" > "),
    filename: chunk.filename,
  }))

  ms.addAll(docs)
  return ms
}

/** 构建并持久化 BM25 索引 */
export async function createBm25Index(
  userId: string,
  projectId: string,
  chunks: Chunk[]
): Promise<void> {
  const ms = buildIndex(chunks)
  // 异步 gzip 压缩后上传，不阻塞事件循环，让并行写入真正重叠
  const json = JSON.stringify(ms)
  const compressed = await gzipAsync(Buffer.from(json, "utf-8"), { level: 6 })
  await storageWrite(getBm25Path(userId, projectId) + ".gz", compressed, {
    contentType: "application/gzip",
  })
  bm25Cache.delete(cacheKey(userId, projectId))
}

/** 加载持久化的 BM25 索引 */
async function loadIndex(userId: string, projectId: string): Promise<MiniSearch<MiniSearchDoc> | null> {
  const key = cacheKey(userId, projectId)
  const cached = bm25Cache.get(key)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.index
  }
  // 优先尝试 gzip 压缩版本，回退到未压缩版本（兼容旧数据）
  let json: string | null = null
  const gzBuf = await readFileBuffer(getBm25Path(userId, projectId) + ".gz")
  if (gzBuf) {
    json = (await gunzipAsync(gzBuf)).toString("utf-8")
  } else {
    json = await readFile(getBm25Path(userId, projectId))
  }
  if (!json) return null
  try {
    const index = MiniSearch.loadJSON<MiniSearchDoc>(json, MINISEARCH_OPTIONS)
    bm25Cache.set(key, { index, loadedAt: Date.now() })
    return index
  } catch (err) {
    console.error("[bm25-store] Failed to parse bm25.json:", err)
    return null
  }
}

/** BM25 全文搜索 */
export async function searchByBm25(
  userId: string,
  projectId: string,
  query: string,
  topK: number = 10,
  chunksData?: Chunk[]
): Promise<SearchResult[]> {
  const ms = await loadIndex(userId, projectId)
  if (!ms) return []

  const results = ms.search(query, {
    ...MINISEARCH_OPTIONS.searchOptions,
  })

  // 加载完整 chunk 数据
  const chunks = chunksData ?? (await loadChunksForBm25(userId, projectId))
  const chunkMap = new Map(chunks.map((c) => [c.id, c]))

  // 归一化分数到 0-1 范围
  const maxScore = results.length > 0 ? results[0].score : 1

  const mapped = results
    .slice(0, topK)
    .map((r) => {
      const chunk = chunkMap.get(r.id as string)
      if (!chunk) return null
      return {
        chunk,
        score: r.score / maxScore, // 归一化
        source: "bm25" as const,
      }
    })
    .filter((r) => r !== null) as SearchResult[]
  return mapped
}

/**
 * 增量重建 BM25 索引：用合并后的全量 chunks 重建
 * MiniSearch 的 remove() 需要完整字段值匹配，不如直接重建可靠
 * BM25 构建是纯 CPU 操作（无 API 调用），几百个 chunks 不到 0.1 秒
 */
export async function rebuildBm25Index(
  userId: string,
  projectId: string,
  allChunks: Chunk[]
): Promise<void> {
  return createBm25Index(userId, projectId, allChunks)
}

/** 删除 BM25 索引 */
export async function deleteBm25Index(userId: string, projectId: string): Promise<void> {
  // 同时清理压缩和未压缩版本
  await Promise.all([
    storageDelete(getBm25Path(userId, projectId) + ".gz"),
    storageDelete(getBm25Path(userId, projectId)),
  ])
  bm25Cache.delete(cacheKey(userId, projectId))
}

// 辅助：从 vector-store 模块加载 chunks 数据
async function loadChunksForBm25(userId: string, projectId: string): Promise<Chunk[]> {
  return loadChunksData(userId, projectId)
}
