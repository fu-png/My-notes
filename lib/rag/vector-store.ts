/**
 * 向量存储适配层（Vectra 封装）
 *
 * 每个项目在 .rag/vectra/ 下有自己的向量索引
 * 支持创建、插入、查询、删除操作
 */

import { LocalIndex } from "vectra"
import path from "path"
import type { Chunk, SearchResult } from "./types"

const CONTENT_DIR = path.join(process.cwd(), "content")

/** 获取项目的向量索引路径 */
function getIndexPath(projectId: string): string {
  return path.join(CONTENT_DIR, "projects", projectId, ".rag", "vectra")
}

/** 获取或创建项目的向量索引 */
async function getIndex(projectId: string): Promise<LocalIndex> {
  const indexPath = getIndexPath(projectId)
  const index = new LocalIndex(indexPath)

  if (!(await index.isIndexCreated())) {
    await index.createIndex()
  }

  return index
}

/** 将 chunks 和对应的 embedding 向量写入向量索引 */
export async function addChunks(
  projectId: string,
  chunks: Chunk[],
  vectors: number[][]
): Promise<void> {
  if (chunks.length !== vectors.length) {
    throw new Error("chunks and vectors must have the same length")
  }
  if (chunks.length === 0) return

  const index = await getIndex(projectId)

  const items = chunks.map((chunk, i) => ({
    id: chunk.id,
    vector: vectors[i],
    metadata: {
      filename: chunk.filename,
      fileTitle: chunk.fileTitle,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      headingPath: chunk.headingPath.join(" > "),
      tokenCount: chunk.tokenCount,
    },
  }))

  await index.beginUpdate()
  try {
    for (const item of items) {
      await index.insertItem(item)
    }
    await index.endUpdate()
  } catch (err) {
    index.cancelUpdate()
    throw err
  }
}

/** 向量相似度搜索 */
export async function searchByVector(
  projectId: string,
  queryVector: number[],
  topK: number = 10
): Promise<SearchResult[]> {
  const indexPath = getIndexPath(projectId)
  const index = new LocalIndex(indexPath)

  if (!(await index.isIndexCreated())) {
    return []
  }

  const results = await index.queryItems(queryVector, "", topK)

  // 需要从 chunks.json 读取完整的 chunk 内容
  const chunksData = await loadChunksData(projectId)
  const chunkMap = new Map(chunksData.map((c) => [c.id, c]))

  const mapped = results
    .map((r) => {
      const chunk = chunkMap.get(r.item.id)
      if (!chunk) return null
      return {
        chunk,
        score: r.score,
        source: "vector" as const,
      }
    })
    .filter((r) => r !== null) as SearchResult[]
  return mapped
}

/** 删除某个文件的所有 chunk 向量 */
export async function deleteFileChunks(
  projectId: string,
  filename: string
): Promise<void> {
  const indexPath = getIndexPath(projectId)
  const index = new LocalIndex(indexPath)

  if (!(await index.isIndexCreated())) return

  const items = await index.listItems()
  const toDelete = items
    .filter(
      (item) =>
        (item.metadata as Record<string, string>).filename === filename
    )
    .map((item) => item.id)

  if (toDelete.length > 0) {
    await index.beginUpdate()
    try {
      await index.deleteItems(toDelete)
      await index.endUpdate()
    } catch (err) {
      index.cancelUpdate()
      throw err
    }
  }
}

/** 删除整个项目的向量索引 */
export async function deleteIndex(projectId: string): Promise<void> {
  const indexPath = getIndexPath(projectId)
  const index = new LocalIndex(indexPath)

  if (await index.isIndexCreated()) {
    await index.deleteIndex()
  }
}

/** 获取索引统计信息 */
export async function getIndexStats(
  projectId: string
): Promise<{ items: number } | null> {
  const indexPath = getIndexPath(projectId)
  const index = new LocalIndex(indexPath)

  if (!(await index.isIndexCreated())) {
    return null
  }

  const stats = await index.getIndexStats()
  return { items: stats.items }
}

// ─── chunks.json 持久化 ───

import fs from "fs"

function getChunksPath(projectId: string): string {
  return path.join(
    CONTENT_DIR,
    "projects",
    projectId,
    ".rag",
    "chunks.json"
  )
}

/** 保存 chunks 元数据到 JSON 文件 */
export async function saveChunksData(
  projectId: string,
  chunks: Chunk[]
): Promise<void> {
  const filePath = getChunksPath(projectId)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(chunks, null, 2), "utf-8")
}

/** 加载 chunks 元数据 */
export async function loadChunksData(projectId: string): Promise<Chunk[]> {
  const filePath = getChunksPath(projectId)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as Chunk[]
  } catch {
    return []
  }
}
