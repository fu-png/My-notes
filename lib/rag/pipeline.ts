/**
 * RAG 管线
 *
 * 将所有 RAG 模块串联为两个核心操作：
 * 1. ingestProject  — 索引整个项目的所有 Markdown 文件
 * 2. queryProject   — 对项目执行 RAG 查询，返回组装好的上下文
 */

import { chunkDocuments } from "./chunker"
import { embedBatch } from "./embedding"
import { addChunks, searchByVector, deleteIndex, loadChunksData, updateChunksByFiles } from "./vector-store"
import { createBm25Index, searchByBm25, rebuildBm25Index } from "./bm25-store"
import { decomposeQuery } from "./query-decomposer"
import { buildContext } from "./context-builder"
import { rerankResults } from "./reranker"
import { buildRAGSystemPrompt, buildPlainSystemPrompt } from "./prompts"
import { buildKnowledgeGraph, saveKnowledgeGraph, loadKnowledgeGraph, expandWithGraph } from "./graph-store"
import type { RAGConfig, AssembledContext, IndexStatus, FileFingerprint, SearchResult } from "./types"
import { readFile, listFiles, writeFile as storageWrite } from "../storage"

// 索引并发锁：防止同一项目的多个索引请求同时执行
const indexingLocks = new Map<string, Promise<void>>()

/** 计算文件内容的简单 hash（用于增量索引的变更检测） */
function simpleHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0 // 转为 32 位整数
  }
  return hash.toString(36)
}

/**
 * 索引整个项目（支持增量索引）
 *
 * 增量逻辑：
 * 1. 计算每个文件的内容 hash，与上次索引时的 fileManifest 对比
 * 2. 如果没有任何文件变更 → 跳过索引，返回现有统计
 * 3. 如果有变更 → 只对变更文件重新分块和 embedding，未变更文件复用旧数据
 * 4. 首次索引或旧索引无 fileManifest → 全量重建
 */
export async function ingestProject(
  projectId: string,
  config: RAGConfig,
  onProgress?: (msg: string) => void
): Promise<{ totalChunks: number; totalFiles: number }> {
  // 等待同一项目的先前索引完成
  const existingLock = indexingLocks.get(projectId)
  if (existingLock) {
    await existingLock
  }
  // 创建新锁
  let resolveLock: () => void
  const lock = new Promise<void>((resolve) => { resolveLock = resolve })
  indexingLocks.set(projectId, lock)
  try {
  const log = onProgress || (() => {})

  log("正在读取项目文件...")

  // 1. 列出项目中所有 Markdown 文件
  const projectPrefix = `projects/${projectId}/`
  const allFiles = await listFiles(projectPrefix, true)
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

  // 2. 并行读取所有文件内容
  const fileReadResults = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await readFile(file.pathname)
      if (content && content.trim().length > 0) {
        const filename = file.pathname.slice(projectPrefix.length)
        return {
          filename,
          title: filename.replace(/\.[^.]+$/, ""),
          content,
        }
      }
      return null
    })
  )
  const documents = fileReadResults.filter(
    (d): d is { filename: string; title: string; content: string } => d !== null
  )

  log(`读取了 ${documents.length} 个文件的内容`)

  // 3. 计算当前文件指纹，与旧索引对比确定变更集
  const currentManifest: Record<string, FileFingerprint> = {}
  for (const doc of documents) {
    currentManifest[doc.filename] = {
      contentHash: simpleHash(doc.content),
      size: doc.content.length,
    }
  }

  const oldStatus = await getIndexStatus(projectId)
  const oldManifest = oldStatus?.fileManifest || {}
  const currentFilenames = new Set(documents.map((d) => d.filename))
  const oldFilenames = new Set(Object.keys(oldManifest))

  // 计算变更集：新增 / 修改 / 删除
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const fn of currentFilenames) {
    if (!oldManifest[fn]) {
      added.push(fn)
    } else if (oldManifest[fn].contentHash !== currentManifest[fn].contentHash) {
      modified.push(fn)
    }
  }
  for (const fn of oldFilenames) {
    if (!currentFilenames.has(fn)) {
      deleted.push(fn)
    }
  }

  const changedFiles = new Set([...added, ...modified, ...deleted])
  const isIncremental = oldStatus?.indexed && Object.keys(oldManifest).length > 0 && changedFiles.size > 0
  const noChanges = oldStatus?.indexed && Object.keys(oldManifest).length > 0 && changedFiles.size === 0

  // 没有任何文件变更 → 跳过索引
  if (noChanges) {
    log("文件无变更，跳过索引")
    return { totalChunks: oldStatus!.totalChunks || 0, totalFiles: oldStatus!.totalFiles || 0 }
  }

  if (isIncremental) {
    log(`增量索引：${added.length} 新增，${modified.length} 修改，${deleted.length} 删除`)
  }

  // 4. 分块（增量时只对变更文件分块）
  log("正在分块...")
  const docsToChunk = isIncremental
    ? documents.filter((d) => added.includes(d.filename) || modified.includes(d.filename))
    : documents
  const newChunks = chunkDocuments(docsToChunk)
  log(`生成了 ${newChunks.length} 个文本块${isIncremental ? "（增量）" : ""}`)

  // 5. Embedding（只对新分块的 chunks 生成 embedding）
  let newEmbeddings: number[][] = []
  let embeddingFailed = false
  if (newChunks.length > 0) {
    log("正在生成 Embedding...")
    const contents = newChunks.map((c) => c.content)
    try {
      let lastReportedPercent = -1
      newEmbeddings = await embedBatch(contents, config, (done, total) => {
        const percent = Math.floor((done / total) * 100)
        if (percent >= lastReportedPercent + 20 || done === total) {
          lastReportedPercent = percent
          log(`Embedding 进度：${done}/${total}（${percent}%）`)
        }
      })
      log(`生成了 ${newEmbeddings.length} 个 Embedding 向量`)
    } catch (err) {
      console.error("[pipeline] Embedding 整体失败，仅创建 BM25 索引:", err)
      log("Embedding 失败，将仅使用全文搜索（BM25）")
      embeddingFailed = true
    }
  }

  // 6. 存入索引
  log("正在存入索引...")
  const indexPromises: Promise<void>[] = []

  if (isIncremental) {
    // 增量模式：局部更新向量存储
    if (!embeddingFailed && newEmbeddings.length > 0) {
      indexPromises.push(updateChunksByFiles(projectId, changedFiles, newChunks, newEmbeddings))
    } else if (deleted.length > 0) {
      // 即使 embedding 失败，也要删除已删除文件的旧 chunks
      indexPromises.push(updateChunksByFiles(projectId, new Set(deleted), [], []))
    }
  } else {
    // 全量模式：清空旧索引 + 整体写入
    await deleteIndex(projectId)
    if (!embeddingFailed && newEmbeddings.length > 0) {
      indexPromises.push(addChunks(projectId, newChunks, newEmbeddings))
    }
  }

  // BM25 索引：用合并后的全量 chunks 重建（CPU 操作，毫秒级）
  // 增量模式下需要先拿到合并后的完整 chunks 列表
  const bm25Promise = (async () => {
    if (isIncremental) {
      // 等向量存储更新完成后，从中获取合并后的全量 chunks
      await Promise.all(indexPromises)
      const allChunks = await loadChunksData(projectId)
      await rebuildBm25Index(projectId, allChunks)
    } else {
      await createBm25Index(projectId, newChunks)
    }
  })()

  // 保存索引状态（含文件指纹快照）
  const statusPromise = (async () => {
    // 增量模式下需要等向量存储完成才能获取准确的 totalChunks
    if (isIncremental) {
      await Promise.all(indexPromises)
      const allChunks = await loadChunksData(projectId)
      await saveIndexStatus(projectId, {
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        totalChunks: allChunks.length,
        totalFiles: documents.length,
        fileManifest: currentManifest,
      })
    } else {
      await saveIndexStatus(projectId, {
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        totalChunks: newChunks.length,
        totalFiles: documents.length,
        fileManifest: currentManifest,
      })
    }
  })()

  await Promise.all([...indexPromises, bm25Promise, statusPromise])

  // 知识图谱：后台异步构建，不阻塞索引完成
  ;(async () => {
    try {
      const allChunks = await loadChunksData(projectId)
      const graph = buildKnowledgeGraph(allChunks)
      await saveKnowledgeGraph(projectId, graph)
      console.debug(`[pipeline] 知识图谱构建完成：${graph.entities.size} 实体，${graph.relations.length} 关系`)
    } catch (err) {
      console.error("[pipeline] 知识图谱构建失败:", err)
    }
  })()

  const finalChunkCount = isIncremental
    ? (await loadChunksData(projectId)).length
    : newChunks.length
  log(`索引完成：${documents.length} 个文件，${finalChunkCount} 个文本块`)
  return { totalChunks: finalChunkCount, totalFiles: documents.length }
  } finally {
    resolveLock!()
    indexingLocks.delete(projectId)
  }
}

/**
 * 对项目执行 RAG 查询
 *
 * 流程：查询分解 → 多路检索 → RRF 融合 → 上下文组装
 */
export async function queryProject(
  projectId: string,
  question: string,
  config: RAGConfig,
  activeFile?: string
): Promise<AssembledContext> {
  // 检查是否已索引
  const status = await getIndexStatus(projectId)
  if (!status?.indexed) {
    // [修复] 即使向量索引不存在，也尝试用 BM25 兜底检索
    // 防止因索引构建失败（如 embedding API 报错）导致 RAG 完全不可用
    try {
      const bm25Results = await searchByBm25(projectId, question, 20)
      if (bm25Results.length > 0) {
        console.debug(`[pipeline] 向量索引不可用，使用 BM25 兜底检索到 ${bm25Results.length} 个结果`)
        const context = buildContext(bm25Results, config.maxContextTokens || 12000)
        return context
      }
    } catch {
      // BM25 索引也不存在，返回空
    }
    return { text: "", sources: [], totalTokens: 0 }
  }

  // 1. 查询分解 + Embedding 并行执行（节省一次串行等待）
  let decomposed: { subQueries: string[]; reasoning: string; original: string }
  let directEmbedding: number[][] = []
  let vectorSearchAvailable = true
  try {
    [decomposed, directEmbedding] = await Promise.all([
      decomposeQuery(question, config),
      embedBatch([question], config),
    ])
  } catch (err) {
    // [修复] embedding 失败时降级到纯 BM25 模式，而不是整体报错
    console.warn("[pipeline] Embedding 失败，降级到纯 BM25 模式:", err)
    decomposed = { original: question, subQueries: [question], reasoning: "Embedding 失败" }
    vectorSearchAvailable = false
  }
  console.debug(`[pipeline] 查询分解为 ${decomposed.subQueries.length} 个子查询:`, decomposed.subQueries)

  // 2. 检索 — 批量 Embedding + 并行检索
  const subQueries = decomposed.subQueries
  // 复用已生成的原始问题 embedding，避免重复调用
  let queryEmbeddings: number[][] = []
  if (vectorSearchAvailable) {
    if (subQueries.length === 1 && subQueries[0] === question) {
      queryEmbeddings = directEmbedding
    } else {
      const originalIdx = subQueries.indexOf(question)
      if (originalIdx >= 0) {
        const others = subQueries.filter((_, i) => i !== originalIdx)
        const otherEmbeddings = others.length > 0 ? await embedBatch(others, config) : []
        queryEmbeddings = []
        let otherI = 0
        for (let i = 0; i < subQueries.length; i++) {
          queryEmbeddings.push(i === originalIdx ? directEmbedding[0] : otherEmbeddings[otherI++])
        }
      } else {
        queryEmbeddings = await embedBatch(subQueries, config)
      }
    }
  }

  const perQueryResults = await Promise.all(
    subQueries.map(async (subQuery, i) => {
      // [修复] 向量搜索失败时降级到纯 BM25
      let vectorResults: SearchResult[] = []
      if (vectorSearchAvailable && queryEmbeddings[i]?.length > 0) {
        try {
          vectorResults = await searchByVector(projectId, queryEmbeddings[i], 30)
        } catch (err) {
          console.warn(`[pipeline] 向量搜索失败，仅使用 BM25:`, err)
        }
      }
      const bm25Results = await searchByBm25(projectId, subQuery, 30)
      // 如果向量搜索没有结果，只用 BM25
      const resultSets = vectorResults.length > 0 ? [vectorResults, bm25Results] : [bm25Results]
      return simpleRRFFuse(resultSets, subQueries.length > 1 ? 25 : 20)
    })
  )

  const results = subQueries.length === 1
    ? perQueryResults[0]
    : simpleRRFFuse(perQueryResults, 25)

  // 3. Score 阈值过滤：去除得分低于最高分 15% 的结果
  //    RRF 分数压缩严重，8% 几乎不过滤；提升到 15% 减少reranker处理量
  const filtered = filterByScoreThreshold(results, 0.15)

  // 4. 当前打开文件加权提升（×1.3）
  const boosted = activeFile
    ? filtered.map((r) =>
        r.chunk.filename === activeFile
          ? { ...r, score: r.score * 1.3 }
          : r
      ).sort((a, b) => b.score - a.score)
    : filtered

  // 5. 重排序：候选 ≤ 3 条时跳过（样本太少无需精排），否则调用 reranker 精排
  const reranked = boosted.length <= 3
    ? boosted
    : await rerankResults(question, boosted, config)

  // 5.5 Graph RAG 扩展：从检索结果中提取实体，在图谱中查找相邻实体，
  //     拉取相关文档块作为补充上下文（解决跨文档多跳推理）
  let withGraphExpansion = reranked
  try {
    // 并行加载知识图谱和块数据（两者互不依赖）
    const [graph, allChunks] = await Promise.all([
      loadKnowledgeGraph(projectId),
      loadChunksData(projectId),
    ])
    if (graph && graph.entities.size > 0) {
      const expansion = expandWithGraph(reranked, graph, allChunks, 8)
      if (expansion.results.length > 0) {
        console.debug(`[pipeline] Graph RAG 扩展：${expansion.results.length} 个补充块，${expansion.entities.length} 个相关实体`)
        withGraphExpansion = [...reranked, ...expansion.results]
      }
    }
  } catch (err) {
    console.error("[pipeline] Graph RAG 扩展失败:", err)
  }

  // 6. 组装上下文
  const context = buildContext(withGraphExpansion, config.maxContextTokens || 12000)
  console.debug(`[pipeline] 组装上下文: ${context.sources.length} 个来源, ${context.totalTokens} tokens`)

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
  const RRF_K = 30 // 降低 k 值增大头部结果的区分度
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

/**
 * Score 阈值过滤：保留得分 ≥ maxScore × threshold 的结果
 * 至少保留前 3 条，避免过滤太激进
 */
function filterByScoreThreshold(
  results: SearchResult[],
  threshold: number
): SearchResult[] {
  if (results.length <= 3) return results
  const maxScore = results[0].score
  const cutoff = maxScore * threshold
  const filtered = results.filter((r) => r.score >= cutoff)
  // 至少保留前 3 条
  return filtered.length >= 3 ? filtered : results.slice(0, 3)
}
