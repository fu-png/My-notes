/**
 * RAG 管线
 *
 * 将所有 RAG 模块串联为两个核心操作：
 * 1. ingestProject  — 索引整个项目的所有 Markdown 文件
 * 2. queryProject   — 对项目执行 RAG 查询，返回组装好的上下文
 */

import { chunkDocuments } from "./chunker"
import { embed, embedBatch } from "./embedding"
import { addChunks, searchByVector, deleteIndex, saveChunksData, loadChunksData } from "./vector-store"
import { createBm25Index, searchByBm25 } from "./bm25-store"
import { decomposeQuery } from "./query-decomposer"
import { buildContext } from "./context-builder"
import { buildRAGSystemPrompt, buildPlainSystemPrompt } from "./prompts"
import type { RAGConfig, AssembledContext, IndexStatus, SearchResult } from "./types"
import { readFile, listFiles, writeFile as storageWrite } from "../storage"

/**
 * 索引整个项目
 *
 * 流程：读取所有 Markdown 文件 → 分块 → Embedding → 存入 Vectra + BM25
 */
export async function ingestProject(
  projectId: string,
  config: RAGConfig,
  onProgress?: (msg: string) => void
): Promise<{ totalChunks: number; totalFiles: number }> {
  const log = onProgress || console.log

  log("正在读取项目文件...")

  // 1. 列出项目中所有 Markdown 文件
  const allFiles = await listFiles(`projects/${projectId}/`)
  const mdFiles = allFiles.filter(
    (f) =>
      !f.pathname.endsWith("/meta.json") &&
      !f.pathname.includes("/.rag/") &&
      (f.pathname.endsWith(".md") || f.pathname.endsWith(".txt") || f.pathname.endsWith(".markdown"))
  )

  if (mdFiles.length === 0) {
    log("项目中没有可索引的 Markdown 文件")
    return { totalChunks: 0, totalFiles: 0 }
  }

  log(`找到 ${mdFiles.length} 个文件`)

  // 2. 读取所有文件内容
  const documents: { filename: string; title: string; content: string }[] = []
  for (const file of mdFiles) {
    const content = await readFile(file.pathname)
    if (content && content.trim().length > 0) {
      const filename = file.pathname.split("/").pop() || file.pathname
      documents.push({
        filename,
        title: filename.replace(/\.[^.]+$/, ""),
        content,
      })
    }
  }

  log(`读取了 ${documents.length} 个文件的内容`)

  // 3. 分块
  log("正在分块...")
  const chunks = chunkDocuments(documents)
  log(`生成了 ${chunks.length} 个文本块`)

  if (chunks.length === 0) {
    return { totalChunks: 0, totalFiles: documents.length }
  }

  // 4. Embedding
  log("正在生成 Embedding（这可能需要几分钟）...")
  const contents = chunks.map((c) => c.content)
  const embeddings = await embedBatch(contents, config)
  log(`生成了 ${embeddings.length} 个 Embedding 向量`)

  // 5. 先清空旧索引，再存入 Vectra
  log("正在存入向量索引...")
  await deleteIndex(projectId)
  await addChunks(projectId, chunks, embeddings)
  // 保存 chunks 元数据
  await saveChunksData(projectId, chunks)
  log("向量索引创建完成")

  // 6. 创建 BM25 索引
  log("正在创建全文搜索索引...")
  await createBm25Index(projectId, chunks)
  log("全文搜索索引创建完成")

  // 7. 保存索引状态
  await saveIndexStatus(projectId, {
    indexed: true,
    lastIndexedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    totalFiles: documents.length,
  })

  log(`索引完成：${documents.length} 个文件，${chunks.length} 个文本块`)
  return { totalChunks: chunks.length, totalFiles: documents.length }
}

/**
 * 对项目执行 RAG 查询
 *
 * 流程：查询分解 → 多路检索 → RRF 融合 → 上下文组装
 */
export async function queryProject(
  projectId: string,
  question: string,
  config: RAGConfig
): Promise<AssembledContext> {
  // 检查是否已索引
  const status = await getIndexStatus(projectId)
  if (!status?.indexed) {
    return { text: "", sources: [], totalTokens: 0 }
  }

  // 1. 查询分解
  const decomposed = await decomposeQuery(question, config)
  console.log(`[pipeline] 查询分解为 ${decomposed.subQueries.length} 个子查询:`, decomposed.subQueries)

  // 2. 检索
  let results: SearchResult[]

  if (decomposed.subQueries.length === 1) {
    // 单查询：直接混合检索
    const queryEmbedding = await embed(decomposed.subQueries[0], config)
    const [vectorResults, bm25Results] = await Promise.all([
      searchByVector(projectId, queryEmbedding, 15),
      searchByBm25(projectId, decomposed.subQueries[0], 15),
    ])
    // 简单 RRF 融合
    results = simpleRRFFuse([vectorResults, bm25Results], 10)
  } else {
    // 多查询：每个子查询分别混合检索，再融合
    const allResults: SearchResult[][] = []
    for (const subQuery of decomposed.subQueries) {
      const queryEmbedding = await embed(subQuery, config)
      const [vectorResults, bm25Results] = await Promise.all([
        searchByVector(projectId, queryEmbedding, 15),
        searchByBm25(projectId, subQuery, 15),
      ])
      const fused = simpleRRFFuse([vectorResults, bm25Results], 15)
      allResults.push(fused)
    }
    // 再次 RRF 融合所有子查询的结果
    results = simpleRRFFuse(allResults, 10)
  }

  // 3. 组装上下文
  const context = buildContext(results, config.maxContextTokens || 4000)
  console.log(`[pipeline] 组装上下文: ${context.sources.length} 个来源, ${context.totalTokens} tokens`)

  return context
}

/**
 * 构建用于 chat API 的完整 system prompt
 */
export function buildSystemPrompt(
  context: AssembledContext,
  activeFileName?: string,
  activeFileContent?: string,
  useRAG: boolean = true
): string {
  if (!useRAG || context.sources.length === 0) {
    return buildPlainSystemPrompt(activeFileName, activeFileContent)
  }
  return buildRAGSystemPrompt(context, activeFileName, activeFileContent)
}

/**
 * 获取项目索引状态
 */
export async function getIndexStatus(projectId: string): Promise<IndexStatus | null> {
  try {
    const content = await readFile(`projects/${projectId}/.rag/status.json`)
    if (!content) return null
    return JSON.parse(content) as IndexStatus
  } catch {
    return null
  }
}

// ─── 内部工具函数 ───

async function saveIndexStatus(projectId: string, status: IndexStatus): Promise<void> {
  await storageWrite(
    `projects/${projectId}/.rag/status.json`,
    JSON.stringify(status, null, 2),
    { contentType: "application/json" }
  )
}

/** 简单的 RRF 融合（内联在 pipeline 中，避免循环依赖） */
function simpleRRFFuse(resultSets: SearchResult[][], topK: number): SearchResult[] {
  const RRF_K = 60
  const scoreMap = new Map<string, { score: number; result: SearchResult }>()

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank]
      const rrfScore = 1 / (RRF_K + rank + 1)

      const existing = scoreMap.get(r.chunk.id)
      if (existing) {
        existing.score += rrfScore
        if (r.score > existing.result.score) {
          existing.result = { ...r, source: "hybrid" }
        } else {
          existing.result = { ...existing.result, source: "hybrid" }
        }
      } else {
        scoreMap.set(r.chunk.id, { score: rrfScore, result: r })
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score, result }) => ({ ...result, score }))
}
