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
        // 每 5% 或完成时汇报一次，Vercel 环境下一次全量索引可能需要 2-3 分钟，
        // 更频繁的进度推送让用户知道系统仍在正常工作
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

  // 6. 存入索引（分步骤推送进度，避免用户长时间看不到反馈）
  //    Vercel 海外服务器到阿里云 OSS 的读写延迟较大（3.5MB JSON 往返可能 30s+），
  //    每个 OSS 操作前后都推送进度，让用户知道系统仍在正常工作。
  if (isIncremental) {
    // 增量模式：局部更新向量存储
    if (!embeddingFailed && newEmbeddings.length > 0) {
      log("正在更新向量索引...")
      await updateChunksByFiles(projectId, changedFiles, newChunks, newEmbeddings, log)
    } else if (deleted.length > 0) {
      log("正在清理已删除文件的索引...")
      await updateChunksByFiles(projectId, new Set(deleted), [], [], log)
    }

    log("正在加载全部文本块...")
    const allChunks = await loadChunksData(projectId)
    log(`正在构建全文搜索索引（${allChunks.length} 个文本块）...`)
    await rebuildBm25Index(projectId, allChunks)

    log("正在保存索引状态...")
    await saveIndexStatus(projectId, {
      indexed: true,
      lastIndexedAt: new Date().toISOString(),
      totalChunks: allChunks.length,
      totalFiles: documents.length,
      fileManifest: currentManifest,
    })
  } else {
    // 全量模式：清空旧索引 + 整体写入
    await deleteIndex(projectId)
    if (!embeddingFailed && newEmbeddings.length > 0) {
      log(`正在写入向量索引（${newChunks.length} 个文本块）...`)
      await addChunks(projectId, newChunks, newEmbeddings)
    }

    log(`正在构建全文搜索索引（${newChunks.length} 个文本块）...`)
    await createBm25Index(projectId, newChunks)

    log("正在保存索引状态...")
    await saveIndexStatus(projectId, {
      indexed: true,
      lastIndexedAt: new Date().toISOString(),
      totalChunks: newChunks.length,
      totalFiles: documents.length,
      fileManifest: currentManifest,
    })
  }

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
  const t0 = Date.now()
  const lap = (label: string) => console.debug(`[pipeline:timing] ${label}: ${Date.now() - t0}ms`)
  const warnings: string[] = []  // 收集降级警告，返回给前端展示

  // 检查是否已索引
  const status = await getIndexStatus(projectId)
  lap("getIndexStatus")
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

  // ── 性能优化：在等待 embedding API 的同时并行预加载索引数据到内存缓存 ──
  // Vercel Serverless 冷启动时，vectors.json / bm25.json / graph.json 需要从 OSS 读取
  // 如果串行执行，光 I/O 就要 3-5 秒；并行预加载可以把 I/O 藏在 embedding 网络延迟里
  const preloadPromise = Promise.all([
    loadChunksData(projectId).catch(() => []),           // 预热 vectors.json 缓存（chunks 与 vectors 共享存储）
    searchByBm25(projectId, "", 0).catch(() => []),      // 预热 bm25.json 缓存
    loadKnowledgeGraph(projectId).catch(() => null),     // 预热 graph.json 缓存
  ])

  // 1. 查询分解 + Embedding + 数据预加载 三者并行
  let decomposed: { subQueries: string[]; reasoning: string; original: string }
  let directEmbedding: number[][] = []
  let vectorSearchAvailable = true
  try {
    [decomposed, directEmbedding] = await Promise.all([
      decomposeQuery(question, config),
      embedBatch([question], config),
      preloadPromise,  // 不阻塞结果，只确保 I/O 已发起
    ]) as [typeof decomposed, typeof directEmbedding, unknown]
  } catch (err) {
    // [修复] embedding 失败时降级到纯 BM25 模式，而不是整体报错
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
  // 复用已生成的原始问题 embedding，避免重复调用
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
        // 降级：仅用原始问题的 embedding 做向量搜索
        queryEmbeddings = subQueries.map(() => directEmbedding[0])
      }
    }
  }

  lap("subQuery embeddings")

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

  lap("vector+bm25 search")

  const results = subQueries.length === 1
    ? perQueryResults[0]
    : simpleRRFFuse(perQueryResults, 25)

  // 3. 标题相关性加权：如果 chunk 的 heading 或 fileTitle 包含查询关键词，加权提升
  //    利用文档结构信息——标题包含关键词的 chunk 通常是该主题的核心章节
  const withTitleBoost = boostByTitleRelevance(results, question)

  // 4. Score 阈值过滤：去除得分低于最高分 20% 的结果
  const filtered = filterByScoreThreshold(withTitleBoost, 0.20)

  // 5. 当前打开文件加权提升（×1.3）
  const boosted = activeFile
    ? filtered.map((r) =>
        r.chunk.filename === activeFile
          ? { ...r, score: r.score * 1.3 }
          : r
      ).sort((a, b) => b.score - a.score)
    : filtered

  // 5. Rerank + Graph RAG 扩展 并行执行（两者互不依赖）
  //    之前串行：rerank ~2s → graph ~1s = 3s
  //    并行后：max(rerank, graph) ≈ 2s，省 ~1s
  const rerankPromise: Promise<import("./reranker").RerankOutput> = boosted.length <= 3
    ? Promise.resolve({ results: boosted })
    : rerankResults(question, boosted, config)

  const graphPromise = (async (): Promise<SearchResult[]> => {
    try {
      const [graph, allChunks] = await Promise.all([
        loadKnowledgeGraph(projectId),
        loadChunksData(projectId),
      ])
      if (graph && graph.entities.size > 0) {
        // 注意：graph expansion 需要 rerank 前的结果（boosted）作为种子
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

  // 收集 reranker 降级警告
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

  // 附加降级警告信息
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

/**
 * RRF 融合 + 文件级去重
 *
 * 优化点：
 * 1. BM25 结果加权 ×1.2（BM25 对精确术语匹配更准）
 * 2. 融合后做文件级去重：同一文件最多保留 MAX_CHUNKS_PER_FILE 个 chunk
 *    防止综合性章节（如总结章）的多个 chunk 霸占 Top-K，挤掉专题章节
 */
const MAX_CHUNKS_PER_FILE_IN_RRF = 3 // RRF 融合后每文件最多保留 3 个 chunk
const BM25_WEIGHT = 1.2 // BM25 权重提升（精确术语匹配更可靠）

function simpleRRFFuse(resultSets: SearchResult[][], topK: number): SearchResult[] {
  const RRF_K = 30
  const scoreMap = new Map<string, { score: number; result: SearchResult }>()

  for (let setIdx = 0; setIdx < resultSets.length; setIdx++) {
    const results = resultSets[setIdx]
    // 判断是否为 BM25 结果集：BM25 结果的 source 字段为 "bm25"
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

  // 按 RRF 分数排序
  const sorted = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)

  // 文件级去重：同一文件最多保留 MAX_CHUNKS_PER_FILE_IN_RRF 个 chunk
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

/**
 * 标题相关性加权
 *
 * 利用文档结构信息提升排序质量：如果 chunk 的 heading 或 fileTitle 包含
 * 查询中的关键词，说明这个 chunk 大概率来自该主题的核心章节。
 * 对这类 chunk 加权 ×1.3，帮助它们在 reranker 之前排到更靠前的位置。
 */
function boostByTitleRelevance(results: SearchResult[], question: string): SearchResult[] {
  // 提取查询中长度 ≥ 2 的中文/英文关键词
  const queryTerms: string[] = []
  // 中文关键词（2字及以上）
  const cjkMatches = question.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g)
  if (cjkMatches) queryTerms.push(...cjkMatches)
  // 英文关键词（3字母及以上）
  const enMatches = question.match(/[a-zA-Z][a-zA-Z0-9_]{2,}/g)
  if (enMatches) queryTerms.push(...enMatches.map((t) => t.toLowerCase()))

  if (queryTerms.length === 0) return results

  const boosted = results.map((r) => {
    const headingText = r.chunk.headingPath.join(" ").toLowerCase()
    const titleText = (r.chunk.fileTitle || "").toLowerCase()
    const combinedMeta = headingText + " " + titleText

    // 计算匹配的关键词数量
    let matchCount = 0
    for (const term of queryTerms) {
      if (combinedMeta.includes(term.toLowerCase())) matchCount++
    }

    // 有关键词命中则加权
    if (matchCount > 0) {
      const boost = 1 + 0.15 * Math.min(matchCount, 3) // 最高 1.45 倍
      return { ...r, score: r.score * boost }
    }
    return r
  })

  return boosted.sort((a, b) => b.score - a.score)
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
