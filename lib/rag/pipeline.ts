/**
 * RAG 管线
 *
 * 将所有 RAG 模块串联为两个核心操作：
 * 1. ingestProject  — 索引整个项目的所有 Markdown 文件
 * 2. queryProject   — 对项目执行 RAG 查询，返回组装好的上下文
 */

import { chunkDocuments } from "./chunker"
import { embedBatch } from "./embedding"
import { addChunks, searchByVector, deleteIndex, saveChunksData, loadChunksData } from "./vector-store"
import { createBm25Index, searchByBm25 } from "./bm25-store"
import { decomposeQuery } from "./query-decomposer"
import { buildContext } from "./context-builder"
import { rerankResults } from "./reranker"
import { buildRAGSystemPrompt, buildPlainSystemPrompt } from "./prompts"
import { buildKnowledgeGraph, saveKnowledgeGraph, loadKnowledgeGraph, expandWithGraph } from "./graph-store"
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

  // 2. 并行读取所有文件内容（提速：从串行 N 次 I/O 改为并行）
  const fileReadResults = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await readFile(file.pathname)
      if (content && content.trim().length > 0) {
        // 使用相对路径作为 filename（包含子目录路径）
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

  // 8. 构建知识图谱
  log("正在构建知识图谱...")
  try {
    const graph = buildKnowledgeGraph(chunks)
    await saveKnowledgeGraph(projectId, graph)
    log(`知识图谱构建完成：${graph.entities.size} 个实体，${graph.relations.length} 条关系`)
  } catch (err) {
    console.error("[pipeline] 知识图谱构建失败:", err)
    log("知识图谱构建失败（不影响基本检索）")
  }

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
  config: RAGConfig,
  activeFile?: string
): Promise<AssembledContext> {
  // 检查是否已索引
  const status = await getIndexStatus(projectId)
  if (!status?.indexed) {
    return { text: "", sources: [], totalTokens: 0 }
  }

  // 1. 查询分解 + Embedding 并行执行（节省一次串行等待）
  const [decomposed, directEmbedding] = await Promise.all([
    decomposeQuery(question, config),
    embedBatch([question], config), // 先为原始问题生成 embedding，分解完成后按需补充
  ])
  console.log(`[pipeline] 查询分解为 ${decomposed.subQueries.length} 个子查询:`, decomposed.subQueries)

  // 2. 检索 — 批量 Embedding + 并行检索
  const subQueries = decomposed.subQueries
  // 复用已生成的原始问题 embedding，避免重复调用
  let queryEmbeddings: number[][]
  if (subQueries.length === 1 && subQueries[0] === question) {
    queryEmbeddings = directEmbedding
  } else {
    queryEmbeddings = await embedBatch(subQueries, config)
  }

  const perQueryResults = await Promise.all(
    subQueries.map(async (subQuery, i) => {
      const [vectorResults, bm25Results] = await Promise.all([
        searchByVector(projectId, queryEmbeddings[i], 15),
        searchByBm25(projectId, subQuery, 15),
      ])
      return simpleRRFFuse([vectorResults, bm25Results], subQueries.length > 1 ? 15 : 10)
    })
  )

  const results = subQueries.length === 1
    ? perQueryResults[0]
    : simpleRRFFuse(perQueryResults, 10)

  // 3. Score 阈值过滤：去除得分低于最高分 15% 的结果
  const filtered = filterByScoreThreshold(results, 0.15)

  // 4. 当前打开文件加权提升（×1.3）
  const boosted = activeFile
    ? filtered.map((r) =>
        r.chunk.filename === activeFile
          ? { ...r, score: r.score * 1.3 }
          : r
      ).sort((a, b) => b.score - a.score)
    : filtered

  // 5. LLM 重排序：候选 ≤ 5 条时跳过（简单查询快速路径），否则精排
  const reranked = boosted.length <= 5
    ? boosted
    : await rerankResults(question, boosted, config)

  // 5.5 Graph RAG 扩展：从检索结果中提取实体，在图谱中查找相邻实体，
  //     拉取相关文档块作为补充上下文（解决跨文档多跳推理）
  let withGraphExpansion = reranked
  try {
    const graph = await loadKnowledgeGraph(projectId)
    if (graph && graph.entities.size > 0) {
      const allChunks = await loadChunksData(projectId)
      const expansion = expandWithGraph(reranked, graph, allChunks, 5)
      if (expansion.results.length > 0) {
        console.log(`[pipeline] Graph RAG 扩展：${expansion.results.length} 个补充块，${expansion.entities.length} 个相关实体`)
        withGraphExpansion = [...reranked, ...expansion.results]
      }
    }
  } catch (err) {
    console.error("[pipeline] Graph RAG 扩展失败:", err)
  }

  // 6. 组装上下文
  const context = buildContext(withGraphExpansion, config.maxContextTokens || 6000)
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
