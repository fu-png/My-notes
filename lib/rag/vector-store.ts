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

/** 内存缓存：避免同一次请求处理内反复读取/反序列化大 JSON */
const cache = new Map<string, VectorStoreData>()

function invalidateCache(projectId: string): void {
  cache.delete(projectId)
}

async function loadVectorStore(projectId: string): Promise<VectorStoreData | null> {
  const cached = cache.get(projectId)
  if (cached) return cached

  const raw = await readFile(getVectorsPath(projectId))
  if (!raw) return null

  try {
    const data = JSON.parse(raw) as VectorStoreData
    cache.set(projectId, data)
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
  cache.set(projectId, data)
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
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

/** 删除某个文件的所有 chunk 向量 */
export async function deleteFileChunks(
  projectId: string,
  filename: string
): Promise<void> {
  const data = await loadVectorStore(projectId)
  if (!data) return

  const keepIndices: number[] = []
  data.chunks.forEach((chunk, i) => {
    if (chunk.filename !== filename) keepIndices.push(i)
  })

  if (keepIndices.length === data.chunks.length) return // 没有需要删除的

  const filtered: VectorStoreData = {
    chunks: keepIndices.map((i) => data.chunks[i]),
    vectors: keepIndices.map((i) => data.vectors[i]),
  }
  await saveVectorStore(projectId, filtered)
}

/** 删除整个项目的向量索引 */
export async function deleteIndex(projectId: string): Promise<void> {
  invalidateCache(projectId)
  await storageDelete(getVectorsPath(projectId))
}

/** 获取索引统计信息 */
export async function getIndexStats(
  projectId: string
): Promise<{ items: number } | null> {
  const data = await loadVectorStore(projectId)
  if (!data) return null
  return { items: data.chunks.length }
}

// ─── chunks.json 持久化（复用 vectors.json 中的 chunks 部分，避免数据重复） ───

/** 保存 chunks 元数据。若对应的向量数据已存在，则原地更新 chunks 部分，保留向量。 */
export async function saveChunksData(
  projectId: string,
  chunks: Chunk[]
): Promise<void> {
  const existing = await loadVectorStore(projectId)
  if (existing && existing.chunks.length === existing.vectors.length) {
    await saveVectorStore(projectId, { ...existing, chunks })
    return
  }
  // 没有已存在的向量数据（理论上不应发生，addChunks 总是先于/随后调用），
  // 退化为只存 chunks、向量置空，避免抛错影响调用方
  await saveVectorStore(projectId, { chunks, vectors: chunks.map(() => []) })
}

/** 加载 chunks 元数据 */
export async function loadChunksData(projectId: string): Promise<Chunk[]> {
  const data = await loadVectorStore(projectId)
  return data?.chunks ?? []
}
