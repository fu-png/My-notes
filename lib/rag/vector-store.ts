/**
 * 向量存储适配层
 *
 * 部署目标是 Vercel Serverless + 阿里云 OSS：Serverless 函数没有持久本地磁盘
 * （每次调用都可能是全新实例，/tmp 也不会跨调用共享），所以向量数据必须整体
 * 持久化到 OSS，不能依赖任何本地文件系统库。
 *
 * 项目规模（几十个文件、几百~几千个 chunk）下，暴力余弦相似度搜索的开销是
 * 毫秒级的，没有必要引入需要本地文件夹的向量数据库（如 Vectra）。策略：
 * - chunks 内容 + 对应的 embedding 向量一起序列化为一份 JSON（vectors.json）
 * - 通过 lib/storage.ts 统一读写（本地开发用本地文件系统，生产用 OSS）
 * - 查询时整份读入内存，做暴力余弦相似度计算并排序取 TopK
 */

import type { Chunk, SearchResult } from "./types"
import { readFile, writeFile as storageWrite, deleteFile as storageDelete } from "../storage"

/** 向量数据文件的持久化结构 */
interface VectorStoreData {
  /** 每个 chunk 对应一个 embedding 向量，按 chunks 数组下标一一对应 */
  chunks: Chunk[]
  vectors: number[][]
}

function getVectorsPath(projectId: string): string {
  return `projects/${projectId}/.rag/vectors.json`
}

/** 内存缓存：避免同一次请求处理内反复读取/反序列化大 JSON
 *  带 TTL（5分钟）和大小限制，防止 Serverless warm 实例内存无限增长
 */
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟
const CACHE_MAX_SIZE = 20 // 最多缓存 20 个项目的向量数据
const cache = new Map<string, { data: VectorStoreData; loadedAt: number }>()

function invalidateCache(projectId: string): void {
  cache.delete(projectId)
}

async function loadVectorStore(projectId: string): Promise<VectorStoreData | null> {
  const cached = cache.get(projectId)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.data
  }
  // 清理过期条目
  if (cached) cache.delete(projectId)

  const raw = await readFile(getVectorsPath(projectId))
  if (!raw) return null

  try {
    const data = JSON.parse(raw) as VectorStoreData
    // 超过上限时清除最旧条目（Map 保持插入顺序）
    if (cache.size >= CACHE_MAX_SIZE) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) cache.delete(oldestKey)
    }
    cache.set(projectId, { data, loadedAt: Date.now() })
    return data
  } catch (err) {
    console.error("[vector-store] Failed to parse vectors.json:", err)
    return null
  }
}

async function saveVectorStore(projectId: string, data: VectorStoreData): Promise<void> {
  await storageWrite(getVectorsPath(projectId), JSON.stringify(data), {
    contentType: "application/json",
  })
  // 超过上限时清除最旧条目
  if (cache.size >= CACHE_MAX_SIZE && !cache.has(projectId)) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(projectId, { data, loadedAt: Date.now() })
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
  projectId: string,
  chunks: Chunk[],
  vectors: number[][]
): Promise<void> {
  if (chunks.length !== vectors.length) {
    throw new Error("chunks and vectors must have the same length")
  }
  if (chunks.length === 0) return

  // 索引流程里 addChunks 之前会先 deleteIndex，因此这里直接覆盖写入即可
  await saveVectorStore(projectId, { chunks, vectors })
}

/**
 * 增量更新向量存储：删除指定文件的旧 chunks，追加新 chunks
 * 先加载现有数据 → 过滤掉变更文件 → 合并新数据 → 一次性写回
 * 保证原子性：不会出现删了旧的但新的没写入的中间状态
 *
 * @param onProgress 可选进度回调，用于在耗时较长的 OSS 读写期间
 *                   向用户推送细粒度进度（Vercel 海外 ↔ 阿里云 OSS 延迟较大）
 */
export async function updateChunksByFiles(
  projectId: string,
  changedFilenames: Set<string>,
  newChunks: Chunk[],
  newVectors: number[][],
  onProgress?: (msg: string) => void
): Promise<void> {
  if (newChunks.length !== newVectors.length) {
    throw new Error("newChunks and newVectors must have the same length")
  }

  onProgress?.("正在加载现有向量数据...")
  const existing = await loadVectorStore(projectId)

  // 保留未变更文件的 chunks 和 vectors
  let keptChunks: Chunk[] = []
  let keptVectors: number[][] = []
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
  await saveVectorStore(projectId, { chunks: mergedChunks, vectors: mergedVectors })
}

/** 向量相似度搜索：暴力计算全部向量的余弦相似度，取 TopK */
export async function searchByVector(
  projectId: string,
  queryVector: number[],
  topK: number = 10
): Promise<SearchResult[]> {
  const data = await loadVectorStore(projectId)
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
export async function deleteIndex(projectId: string): Promise<void> {
  invalidateCache(projectId)
  await storageDelete(getVectorsPath(projectId))
}

// ─── chunks.json 持久化（复用 vectors.json 中的 chunks 部分，避免数据重复） ───

/** 加载 chunks 元数据 */
export async function loadChunksData(projectId: string): Promise<Chunk[]> {
  const data = await loadVectorStore(projectId)
  return data?.chunks ?? []
}
