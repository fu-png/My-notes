/**
 * RAG 管线
 *
 * 将所有 RAG 模块串联为两个核心操作：
 * 1. ingestProject  — 索引整个项目的所有 Markdown 文件
 * 2. queryProject   — 对项目执行 RAG 查询，返回组装好的上下文
 *
 * 迁移说明：从 apps/web/lib/rag/pipeline.ts 迁移而来。
 * 所有导出函数新增 userId 参数并透传给下游存储模块，
 * 存储路径从 `projects/{projectId}/...` 改为
 * `users/{userId}/projects/{projectId}/...`，实现多租户数据隔离。
 */

import { chunkDocuments } from "./chunker.js"
import { embedBatch } from "./embedding.js"
import { addChunks, searchByVector, deleteIndex, loadChunksData, updateChunksByFiles } from "./vector-store.js"
import { createBm25Index, searchByBm25, rebuildBm25Index } from "./bm25-store.js"
import { decomposeQuery } from "./query-decomposer.js"
import { buildContext } from "./context-builder.js"
import { rerankResults } from "./reranker.js"
import { buildRAGSystemPrompt, buildPlainSystemPrompt } from "./prompts.js"
import { buildKnowledgeGraph, saveKnowledgeGraph, loadKnowledgeGraph, expandWithGraph } from "./graph-store.js"
import type { RAGConfig, AssembledContext, IndexStatus, FileFingerprint, SearchResult, Chunk } from "./types.js"
import { readFile, listFiles, writeFile as storageWrite } from "../storage.js"
import { userProjectPrefix } from "../storage.js"

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
  userId: string,
  projectId: string,
  config: RAGConfig,
  onProgress?: (msg: string) => void
): Promise<{ totalChunks: number; totalFiles: number }> {
  const lockKey = `${userId}/${projectId}`
  // 等待同一项目的先前索引完成
  const existingLock = indexingLocks.get(lockKey)
  if (existingLock) {
    await existingLock
  }
  // 创建新锁
  let resolveLock: () => void
  const lock = new Promise<void>((resolve) => { resolveLock = resolve })
  indexingLocks.set(lockKey, lock)
  try {
  const log = onProgress || (() => {})

  log("正在读取项目文件...")

  // 1. 列出项目中所有 Markdown 文件
  const projectPrefix = userProjectPrefix(userId, projectId)
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

  // 2. 并行读取所有文件内容 + 同时获取旧索引状态（省一个 OSS 往返）
  const [fileReadResults, oldStatus] = await Promise.all([
    Promise.all(
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
    ),
    getIndexStatus(userId, projectId),
  ])
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
        if (percent >= lastReportedPercent + 5 || done === total) {
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
  let finalChunks: Chunk[]

  if (isIncremental) {
    // 增量模式：先合并向量数据（需要下载旧数据），再并行写入所有索引
    let allChunks: Chunk[]
    if (!embeddingFailed && newEmbeddings.length > 0) {
      log("正在更新向量索引...")
      const merged = await updateChunksByFiles(userId, projectId, changedFiles, newChunks, newEmbeddings, log)
      allChunks = merged.chunks
    } else if (deleted.length > 0) {
      log("正在清理已删除文件的索引...")
      const merged = await updateChunksByFiles(userId, projectId, new Set(deleted), [], [], log)
      allChunks = merged.chunks
    } else {
      allChunks = await loadChunksData(userId, projectId)
    }

    // 并行写入 BM25 索引 + 状态信息（向量已在 updateChunksByFiles 中写入）
    log(`正在并行写入搜索索引和状态（${allChunks.length} 个文本块）...`)
    await Promise.all([
      rebuildBm25Index(userId, projectId, allChunks),
      saveIndexStatus(userId, projectId, {
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        totalChunks: allChunks.length,
        totalFiles: documents.length,
        fileManifest: currentManifest,
      }),
    ])
    finalChunks = allChunks
  } else {
    // 全量模式：覆盖写入（put 自动覆盖，无需先 delete）
    log(`正在并行写入所有索引（${newChunks.length} 个文本块）...`)
    const writes: Promise<void>[] = []
    if (!embeddingFailed && newEmbeddings.length > 0) {
      writes.push(addChunks(userId, projectId, newChunks, newEmbeddings))
    }
    writes.push(createBm25Index(userId, projectId, newChunks))
    writes.push(saveIndexStatus(userId, projectId, {
      indexed: true,
      lastIndexedAt: new Date().toISOString(),
      totalChunks: newChunks.length,
      totalFiles: documents.length,
      fileManifest: currentManifest,
    }))
    await Promise.all(writes)
    finalChunks = newChunks
  }

  // 知识图谱：后台异步构建，不阻塞索引完成
  ;(async () => {
    try {
      const graph = buildKnowledgeGraph(finalChunks)
      await saveKnowledgeGraph(userId, projectId, graph)
      console.debug(`[pipeline] 知识图谱构建完成：${graph.entities.size} 实体，${graph.relations.length} 关系`)
    } catch (err) {
      console.error("[pipeline] 知识图谱构建失败:", err)
    }
  })()

  log(`索引完成：${documents.length} 个文件，${finalChunks.length} 个文本块`)
  return { totalChunks: finalChunks.length, totalFiles: documents.length }
  } finally {
    resolveLock!()
    indexingLocks.delete(lockKey)
  }
}

/**
 * 对项目执行 RAG 查询
 *
 * 流程：查询分解 → 多路检索 → RRF 融合 → 上下文组装
 */
export async function queryProject(
  userId: string,
  projectId: string,
  question: string,
  config: RAGConfig,
  activeFile?: string
): Promise<AssembledContext> {
  const t0 = Date.now()
  const lap = (label: string) => console.debug(`[pipeline:timing] ${label}: ${Date.now() - t0}ms`)
  const warnings: string[] = []

  // 检查是否已索引
  const status = await getIndexStatus(userId, projectId)
  lap("getIndexStatus")
  if (!status?.indexed) {
    // [修复] 即使向量索引不存在，也尝试用 BM25 兜底检索
    try {
      const bm25Results = await searchByBm25(userId, projectId, question, 20)
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

  // ── 性能优化：在等待 embedding API 的同时并行预加载索引数据到内存缓存 ──
  const preloadPromise = Promise.all([
    loadChunksData(userId, projectId).catch(() => []),
    searchByBm25(userId, projectId, "", 0).catch(() => []),
    loadKnowledgeGraph(userId, projectId).catch(() => null),
  ])

  // 1. 查询分解 + Embedding + 数据预加载 三者并行
  let decomposed: { subQueries: string[]; reasoning: string; original: string }
  let directEmbedding: number[][] = []
  let vectorSearchAvailable = true
  try {
    [decomposed, directEmbedding] = await Promise.all([
      decomposeQuery(question, config),
      embedBatch([question], config),
      preloadPromise,
    ]) as [typeof decomposed, typeof directEmbedding, unknown]
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn("[pipeline] Embedding 失败，降级到纯 BM25 模式:", err)
    warnings.push(`Embedding 模型调用失败 (${errMsg})，已降级为全文检索`)
    decomposed = { original: question, subQueries: [question], reasoning: "Embedding 失败" }
    vectorSearchAvailable = false
  }
  lap("decomposeQuery + embedBatch + preload")
  console.debug(`[pipeline] 查询分解为 ${decomposed.subQueries.length} 个子查询:`, decomposed.subQueries)

  // 2. 检索 — 批量 Embedding + 并行检索
  const subQueries = decomposed.subQueries
  let queryEmbeddings: number[][] = []
  if (vectorSearchAvailable) {
    if (subQueries.length === 1 && subQueries[0] === question) {
      queryEmbeddings = directEmbedding
    } else {
      try {
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
      } catch (err) {
        console.warn("[pipeline] 子查询 Embedding 失败，仅使用原始问题向量:", err)
        warnings.push("子查询向量化失败，检索精度可能下降")
        queryEmbeddings = subQueries.map(() => directEmbedding[0])
      }
    }
  }

  lap("subQuery embeddings")

  const perQueryResults = await Promise.all(
    subQueries.map(async (subQuery, i) => {
      let vectorResults: SearchResult[] = []
      if (vectorSearchAvailable && queryEmbeddings[i]?.length > 0) {
        try {
          vectorResults = await searchByVector(userId, projectId, queryEmbeddings[i], 30)
        } catch (err) {
          console.warn(`[pipeline] 向量搜索失败，仅使用 BM25:`, err)
        }
      }
      const bm25Results = await searchByBm25(userId, projectId, subQuery, 30)
      const resultSets = vectorResults.length > 0 ? [vectorResults, bm25Results] : [bm25Results]
      return simpleRRFFuse(resultSets, subQueries.length > 1 ? 25 : 20)
    })
  )

  lap("vector+bm25 search")

  const results = subQueries.length === 1
    ? perQueryResults[0]
    : simpleRRFFuse(perQueryResults, 25)

  // 3. 标题相关性加权
  const withTitleBoost = boostByTitleRelevance(results, question)

  // 4. Score 阈值过滤
  const filtered = filterByScoreThreshold(withTitleBoost, 0.20)

  // 5. 当前打开文件加权提升（×1.3）
  const boosted = activeFile
    ? filtered.map((r) =>
        r.chunk.filename === activeFile
          ? { ...r, score: r.score * 1.3 }
          : r
      ).sort((a, b) => b.score - a.score)
    : filtered

  // 5. Rerank + Graph RAG 扩展 并行执行
  const rerankPromise: Promise<import("./reranker.js").RerankOutput> = boosted.length <= 3
    ? Promise.resolve({ results: boosted })
    : rerankResults(question, boosted, config)

  const graphPromise = (async (): Promise<SearchResult[]> => {
    try {
      const [graph, allChunks] = await Promise.all([
        loadKnowledgeGraph(userId, projectId),
        loadChunksData(userId, projectId),
      ])
      if (graph && graph.entities.size > 0) {
        const expansion = expandWithGraph(boosted, graph, allChunks, 8)
        if (expansion.results.length > 0) {
          console.debug(`[pipeline] Graph RAG 扩展：${expansion.results.length} 个补充块，${expansion.entities.length} 个相关实体`)
          return expansion.results
        }
      }
    } catch (err) {
      console.error("[pipeline] Graph RAG 扩展失败:", err)
    }
    return []
  })()

  const [rerankOutput, graphResults] = await Promise.all([rerankPromise, graphPromise])
  lap("rerank + graph (parallel)")

  if (rerankOutput.fallbackReason) {
    warnings.push(rerankOutput.fallbackReason)
  }

  const reranked = rerankOutput.results
  const withGraphExpansion = graphResults.length > 0
    ? [...reranked, ...graphResults]
    : reranked

  // 6. 组装上下文
  const context = buildContext(withGraphExpansion, config.maxContextTokens || 12000)
  lap("TOTAL")
  console.debug(`[pipeline] 组装上下文: ${context.sources.length} 个来源, ${context.totalTokens} tokens`)

  if (warnings.length > 0) {
    context.warnings = warnings
  }
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
export async function getIndexStatus(userId: string, projectId: string): Promise<IndexStatus | null> {
  try {
    const content = await readFile(`${userProjectPrefix(userId, projectId)}.rag/status.json`)
    if (!content) return null
    return JSON.parse(content) as IndexStatus
  } catch {
    return null
  }
}

// ─── 内部工具函数 ───

async function saveIndexStatus(userId: string, projectId: string, status: IndexStatus): Promise<void> {
  await storageWrite(
    `${userProjectPrefix(userId, projectId)}.rag/status.json`,
    JSON.stringify(status, null, 2),
    { contentType: "application/json" }
  )
}

const MAX_CHUNKS_PER_FILE_IN_RRF = 3
const BM25_WEIGHT = 1.2

function simpleRRFFuse(resultSets: SearchResult[][], topK: number): SearchResult[] {
  const RRF_K = 30
  const scoreMap = new Map<string, { score: number; result: SearchResult }>()

  for (let setIdx = 0; setIdx < resultSets.length; setIdx++) {
    const results = resultSets[setIdx]
    const isBm25 = results.length > 0 && results[0].source === "bm25"
    const weight = isBm25 ? BM25_WEIGHT : 1.0

    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank]
      const rrfScore = weight / (RRF_K + rank + 1)

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

  const sorted = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)

  const fileCount = new Map<string, number>()
  const deduped: typeof sorted = []
  for (const item of sorted) {
    const fn = item.result.chunk.filename
    const count = fileCount.get(fn) || 0
    if (count < MAX_CHUNKS_PER_FILE_IN_RRF) {
      deduped.push(item)
      fileCount.set(fn, count + 1)
    }
  }

  return deduped
    .slice(0, topK)
    .map(({ score, result }) => ({ ...result, score }))
}

function boostByTitleRelevance(results: SearchResult[], question: string): SearchResult[] {
  const queryTerms: string[] = []
  const cjkMatches = question.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g)
  if (cjkMatches) queryTerms.push(...cjkMatches)
  const enMatches = question.match(/[a-zA-Z][a-zA-Z0-9_]{2,}/g)
  if (enMatches) queryTerms.push(...enMatches.map((t) => t.toLowerCase()))

  if (queryTerms.length === 0) return results

  const boosted = results.map((r) => {
    const headingText = r.chunk.headingPath.join(" ").toLowerCase()
    const titleText = (r.chunk.fileTitle || "").toLowerCase()
    const combinedMeta = headingText + " " + titleText

    let matchCount = 0
    for (const term of queryTerms) {
      if (combinedMeta.includes(term.toLowerCase())) matchCount++
    }

    if (matchCount > 0) {
      const boost = 1 + 0.15 * Math.min(matchCount, 3)
      return { ...r, score: r.score * boost }
    }
    return r
  })

  return boosted.sort((a, b) => b.score - a.score)
}

function filterByScoreThreshold(
  results: SearchResult[],
  threshold: number
): SearchResult[] {
  if (results.length <= 3) return results
  const maxScore = results[0].score
  const cutoff = maxScore * threshold
  const filtered = results.filter((r) => r.score >= cutoff)
  return filtered.length >= 3 ? filtered : results.slice(0, 3)
}
