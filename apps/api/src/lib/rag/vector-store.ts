/**
 * 向量存储适配层
 *
 * 项目规模（几十个文件、几百~几千个 chunk）下，暴力余弦相似度搜索的开销是
 * 毫秒级的，没有必要引入需要本地文件夹的向量数据库。策略：
 * - chunks 内容 + 对应的 embedding 向量一起序列化为一份 JSON（vectors.json）
 * - 通过 lib/storage.ts 统一读写（本地开发用本地文件系统，生产用 OSS）
 * - 查询时整份读入内存，做暴力余弦相似度计算并排序取 TopK
 *
 * 迁移说明：从 apps/web/lib/rag/vector-store.ts 迁移而来。
 * 所有导出函数新增 userId 参数，存储路径从 `projects/{projectId}/.rag/...`
 * 改为 `users/{userId}/projects/{projectId}/.rag/...`，实现多租户数据隔离。
 */

import type { Chunk, SearchResult } from "./types.js"
import { readFile, readFileBuffer, writeFile as storageWrite, deleteFile as storageDelete } from "../storage.js"
import { userProjectPrefix } from "../storage.js"
import { gzip, gunzip } from "node:zlib"
import { promisify } from "node:util"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** 向量数据文件的持久化结构 */
interface VectorStoreData {
  /** 每个 chunk 对应一个 embedding 向量，按 chunks 数组下标一一对应 */
  chunks: Chunk[]
  vectors: number[][]
}

function getVectorsPath(userId: string, projectId: string): string {
  return `${userProjectPrefix(userId, projectId)}.rag/vectors.json`
}

/** 内存缓存：避免同一次请求处理内反复读取/反序列化大 JSON
 *  带 TTL（5分钟）和大小限制，防止内存无限增长
 */
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟
const CACHE_MAX_SIZE = 20 // 最多缓存 20 个项目的向量数据
const cache = new Map<string, { data: VectorStoreData; loadedAt: number }>()

function cacheKey(userId: string, projectId: string): string {
  return `${userId}/${projectId}`
}

function invalidateCache(userId: string, projectId: string): void {
  cache.delete(cacheKey(userId, projectId))
}

async function loadVectorStore(userId: string, projectId: string): Promise<VectorStoreData | null> {
  const key = cacheKey(userId, projectId)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.data
  }
  // 清理过期条目
  if (cached) cache.delete(key)

  // 优先尝试 gzip 压缩版本，回退到未压缩版本（兼容旧数据）
  const gzBuf = await readFileBuffer(getVectorsPath(userId, projectId) + ".gz")
  let jsonStr: string
  if (gzBuf) {
    jsonStr = (await gunzipAsync(gzBuf)).toString("utf-8")
  } else {
    const plainRaw = await readFile(getVectorsPath(userId, projectId))
    if (!plainRaw) return null
    jsonStr = plainRaw
  }

  try {
    const data = JSON.parse(jsonStr) as VectorStoreData
    // 超过上限时清除最旧条目（Map 保持插入顺序）
    if (cache.size >= CACHE_MAX_SIZE) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) cache.delete(oldestKey)
    }
    cache.set(key, { data, loadedAt: Date.now() })
    return data
  } catch (err) {
    console.error("[vector-store] Failed to parse vectors.json:", err)
    return null
  }
}

async function saveVectorStore(userId: string, projectId: string, data: VectorStoreData): Promise<void> {
  const key = cacheKey(userId, projectId)
  // 异步 gzip 压缩后上传，不阻塞事件循环，让并行写入真正重叠
  const json = JSON.stringify(data)
  const compressed = await gzipAsync(Buffer.from(json, "utf-8"), { level: 6 })
  await storageWrite(getVectorsPath(userId, projectId) + ".gz", compressed, {
    contentType: "application/gzip",
  })
  // 超过上限时清除最旧条目
  if (cache.size >= CACHE_MAX_SIZE && !cache.has(key)) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { data, loadedAt: Date.now() })
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  // 维度不匹配或空向量时返回 0（避免 NaN 污染搜索结果）
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** 将 chunks 和对应的 embedding 向量写入向量存储（覆盖写入） */
export async function addChunks(
  userId: string,
  projectId: string,
  chunks: Chunk[],
  vectors: number[][]
): Promise<void> {
  if (chunks.length !== vectors.length) {
    throw new Error("chunks and vectors must have the same length")
  }
  if (chunks.length === 0) return

  // 索引流程里 addChunks 之前会先 deleteIndex，因此这里直接覆盖写入即可
  await saveVectorStore(userId, projectId, { chunks, vectors })
}

/**
 * 增量更新向量存储：删除指定文件的旧 chunks，追加新 chunks
 * 先加载现有数据 → 过滤掉变更文件 → 合并新数据 → 一次性写回
 * 保证原子性：不会出现删了旧的但新的没写入的中间状态
 *
 * @param onProgress 可选进度回调，用于在耗时较长的 OSS 读写期间
 *                   向用户推送细粒度进度
 */
export async function updateChunksByFiles(
  userId: string,
  projectId: string,
  changedFilenames: Set<string>,
  newChunks: Chunk[],
  newVectors: number[][],
  onProgress?: (msg: string) => void
): Promise<{ chunks: Chunk[]; vectors: number[][] }> {
  if (newChunks.length !== newVectors.length) {
    throw new Error("newChunks and newVectors must have the same length")
  }

  onProgress?.("正在加载现有向量数据...")
  const existing = await loadVectorStore(userId, projectId)

  // 保留未变更文件的 chunks 和 vectors
  const keptChunks: Chunk[] = []
  const keptVectors: number[][] = []
  if (existing) {
    for (let i = 0; i < existing.chunks.length; i++) {
      if (!changedFilenames.has(existing.chunks[i].filename)) {
        keptChunks.push(existing.chunks[i])
        keptVectors.push(existing.vectors[i])
      }
    }
  }

  // 合并：保留的 + 新增的
  const mergedChunks = [...keptChunks, ...newChunks]
  const mergedVectors = [...keptVectors, ...newVectors]

  onProgress?.(`正在上传向量数据（${mergedChunks.length} 个文本块）...`)
  await saveVectorStore(userId, projectId, { chunks: mergedChunks, vectors: mergedVectors })

  // 返回合并后的数据，供调用方直接使用（避免再次从 OSS 下载）
  return { chunks: mergedChunks, vectors: mergedVectors }
}

/** 向量相似度搜索：暴力计算全部向量的余弦相似度，取 TopK */
export async function searchByVector(
  userId: string,
  projectId: string,
  queryVector: number[],
  topK: number = 10
): Promise<SearchResult[]> {
  const data = await loadVectorStore(userId, projectId)
  if (!data || data.chunks.length === 0) return []

  const scored = data.vectors.map((vector, i) => ({
    chunk: data.chunks[i],
    score: cosineSimilarity(queryVector, vector),
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, topK).map((r) => ({
    chunk: r.chunk,
    score: r.score,
    source: "vector" as const,
  }))
}

/** 删除整个项目的向量索引 */
export async function deleteIndex(userId: string, projectId: string): Promise<void> {
  invalidateCache(userId, projectId)
  // 同时清理压缩和未压缩版本
  await Promise.all([
    storageDelete(getVectorsPath(userId, projectId) + ".gz"),
    storageDelete(getVectorsPath(userId, projectId)),
  ])
}

// ─── chunks.json 持久化（复用 vectors.json 中的 chunks 部分，避免数据重复） ───

/** 加载 chunks 元数据 */
export async function loadChunksData(userId: string, projectId: string): Promise<Chunk[]> {
  const data = await loadVectorStore(userId, projectId)
  return data?.chunks ?? []
}
