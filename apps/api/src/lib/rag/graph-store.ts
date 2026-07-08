/**
 * Graph RAG — 实体-关系图谱
 *
 * 在传统向量+BM25 检索之上，构建文档间的实体-关系图谱。
 * 当用户查询涉及跨文档多跳推理时，通过图谱扩展检索范围。
 *
 * 迁移说明：从 apps/web/lib/rag/graph-store.ts 迁移而来。
 * saveKnowledgeGraph / loadKnowledgeGraph 新增 userId 参数，
 * 存储路径从 `projects/{projectId}/.rag/...` 改为
 * `users/{userId}/projects/{projectId}/.rag/...`。
 * buildKnowledgeGraph / expandWithGraph 是纯计算函数，不涉及存储，保持不变。
 */

import type { Chunk, SearchResult } from "./types.js"
import { readFile, readFileBuffer, writeFile as storageWrite } from "../storage.js"
import { userProjectPrefix } from "../storage.js"
import { gzip, gunzip } from "node:zlib"
import { promisify } from "node:util"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// ─── 类型定义 ───

export interface GraphEntity {
  id: string
  name: string
  type: "concept" | "person" | "org" | "tech" | "other"
  /** 出现在哪些文档中 */
  documents: string[]
  /** 文档集合（O(1) 查找，避免 includes 线性扫描） */
  documentSet?: Set<string>
  /** 出现次数 */
  frequency: number
}

export interface GraphRelation {
  source: string
  target: string
  /** 关系类型 */
  type: "co-occurrence" | "link" | "heading"
  /** 权重 */
  weight: number
}

export interface KnowledgeGraph {
  entities: Map<string, GraphEntity>
  relations: GraphRelation[]
}

export interface GraphSearchResult {
  /** 扩展的检索结果 */
  results: SearchResult[]
  /** 图谱中找到的实体（用于前端展示） */
  entities: { name: string; type: string; documents: string[] }[]
}

// ─── 实体抽取 ───

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g
const CODE_REF_RE = /`([^`]{2,30})`/g
const PROPER_NOUN_RE = /(?:[A-Z][a-z]+(?:\s[A-Z][a-z]+)+)|(?:[A-Z]{2,6}(?=\s|[，。、）]))/g
const BOLD_RE = /\*\*([^*]{2,30})\*\*/g

const ENTITY_STOPWORDS = new Set(
  [
    "TD", "TB", "LR", "RL", "BT",
    "学习目标：", "学习目标", "交叉引用：", "交叉引用", "最佳实践：", "最佳实践",
    "关键要点", "实战练习", "反模式警告：", "反模式警告", "本章小结", "小结",
    "章节导读", "延伸阅读", "参考资料", "练习", "总结", "思考题：", "思考题",
    "交叉引用提示：", "交叉引用提示",
    "API", "UI", "AI", "SDK", "CLI", "CI", "CD", "JSON", "URL", "ID",
    "HTTP", "HTTPS", "OS", "IO", "DB", "SQL",
  ].map((w) => w.toLowerCase())
)

const MAX_ENTITY_DOCUMENT_RATIO = 0.3

function isStopwordEntity(name: string): boolean {
  const normalized = name.toLowerCase().trim()
  if (ENTITY_STOPWORDS.has(normalized)) return true
  const stripped = normalized.replace(/[：:，,。.！!？?]+$/g, "")
  if (ENTITY_STOPWORDS.has(stripped)) return true
  return false
}

function extractEntities(text: string): string[] {
  const entities = new Set<string>()

  for (const m of text.matchAll(WIKI_LINK_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  for (const m of text.matchAll(MD_LINK_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  for (const m of text.matchAll(CODE_REF_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  for (const m of text.matchAll(BOLD_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  for (const m of text.matchAll(PROPER_NOUN_RE)) {
    const name = m[0].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  const headingMatch = text.match(/^#{1,3}\s+(.+)$/gm)
  if (headingMatch) {
    for (const h of headingMatch) {
      const name = h.replace(/^#{1,3}\s+/, "").trim()
      if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
    }
  }

  return Array.from(entities)
}

function inferEntityType(name: string): GraphEntity["type"] {
  if (/^[A-Z]{2,6}$/.test(name)) return "tech"
  if (/^[张王李赵刘陈杨黄周吴徐孙马朱胡郭林何高梁郑罗宋谢唐韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤]/.test(name) && name.length <= 4) return "person"
  if (/(公司|集团|团队|组织|部门|委员会|大学|学院|研究所|实验室)/.test(name)) return "org"
  if (/(AI|LLM|API|SDK|GPT|RAG|Graph|Vector|Embedding|Token|Model|Transformer|Attention|Framework|React|Vue|Node|Python|Java|TypeScript|JavaScript|Docker|Kubernetes)/i.test(name)) return "tech"
  return "concept"
}

// ─── 图谱构建 ───

const HUB_ENTITY_MIN_DOCUMENTS = 6

/** 从文档分块列表构建知识图谱（纯计算函数，不涉及存储） */
export function buildKnowledgeGraph(chunks: Chunk[]): KnowledgeGraph {
  const entities = new Map<string, GraphEntity>()
  const relations: GraphRelation[] = []
  const relationIndex = new Map<string, number>()

  const normalizeName = (name: string) => name.toLowerCase().trim()
  const makeRelationKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`

  const chunkEntitiesList = chunks.map((chunk) => ({
    chunk,
    entityNames: extractEntities(chunk.content),
  }))

  const totalDocuments = new Set(chunks.map((c) => c.filename)).size
  const hubThreshold = Math.max(
    HUB_ENTITY_MIN_DOCUMENTS,
    Math.ceil(totalDocuments * MAX_ENTITY_DOCUMENT_RATIO)
  )

  for (const { chunk, entityNames } of chunkEntitiesList) {
    for (const name of entityNames) {
      const normalized = normalizeName(name)
      const existing = entities.get(normalized)

      if (existing) {
        if (!existing.documentSet!.has(chunk.filename)) {
          existing.documents.push(chunk.filename)
          existing.documentSet!.add(chunk.filename)
        }
        existing.frequency++
      } else {
        const entity: GraphEntity = {
          id: normalized,
          name,
          type: inferEntityType(name),
          documents: [chunk.filename],
          documentSet: new Set([chunk.filename]),
          frequency: 1,
        }
        entities.set(normalized, entity)
      }
    }
  }

  const hubEntityIds = new Set<string>()
  for (const [id, entity] of entities) {
    if (entity.documents.length > hubThreshold) {
      hubEntityIds.add(id)
      entities.delete(id)
    }
  }
  if (hubEntityIds.size > 0) {
    console.debug(
      `[graph-store] 剔除 ${hubEntityIds.size} 个超级节点实体（文档覆盖率过高，阈值 > ${hubThreshold} 篇）`
    )
  }

  for (const { entityNames } of chunkEntitiesList) {
    const validEntities = entityNames.filter(
      (name) => !hubEntityIds.has(normalizeName(name))
    )

    for (let i = 0; i < validEntities.length; i++) {
      for (let j = i + 1; j < validEntities.length; j++) {
        const a = normalizeName(validEntities[i])
        const b = normalizeName(validEntities[j])
        if (a === b) continue

        const key = makeRelationKey(a, b)
        const existingIdx = relationIndex.get(key)
        if (existingIdx !== undefined) {
          relations[existingIdx].weight++
        } else {
          const idx = relations.length
          relations.push({
            source: a,
            target: b,
            type: "co-occurrence",
            weight: 1,
          })
          relationIndex.set(key, idx)
        }
      }
    }
  }

  return { entities, relations }
}

// ─── 图谱查询 ───

/** 从检索结果中提取实体，并在图谱中查找相邻实体（纯计算函数，不涉及存储） */
export function expandWithGraph(
  initialResults: SearchResult[],
  graph: KnowledgeGraph,
  allChunks: Chunk[],
  maxExpansions: number = 5
): GraphSearchResult {
  if (graph.entities.size === 0) {
    return { results: [], entities: [] }
  }

  const adjacency = new Map<string, { target: string; weight: number }[]>()
  for (const relation of graph.relations) {
    if (!adjacency.has(relation.source)) adjacency.set(relation.source, [])
    adjacency.get(relation.source)!.push({ target: relation.target, weight: relation.weight })
    if (!adjacency.has(relation.target)) adjacency.set(relation.target, [])
    adjacency.get(relation.target)!.push({ target: relation.source, weight: relation.weight })
  }

  const queryEntities = new Set<string>()
  const foundEntityNames: { name: string; type: string; documents: string[] }[] = []

  const initialFilenames = new Set(initialResults.map((r) => r.chunk.filename))

  for (const [entityId, entity] of graph.entities) {
    const hasMatchingDoc = entity.documents.some((doc) => initialFilenames.has(doc))
    if (hasMatchingDoc) {
      queryEntities.add(entityId)
      foundEntityNames.push({
        name: entity.name,
        type: entity.type,
        documents: entity.documents,
      })
    }
  }

  if (queryEntities.size === 0) {
    return { results: [], entities: [] }
  }

  const MAX_NEIGHBOR_ENTITIES = 20
  const neighborWeights = new Map<string, number>()
  for (const entityId of queryEntities) {
    const neighbors = adjacency.get(entityId)
    if (neighbors) {
      for (const { target, weight } of neighbors) {
        if (!queryEntities.has(target)) {
          neighborWeights.set(target, (neighborWeights.get(target) || 0) + weight)
        }
      }
    }
  }
  const neighborEntities = new Set(
    Array.from(neighborWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_NEIGHBOR_ENTITIES)
      .map(([id]) => id)
  )

  const expansionDocuments = new Set<string>()
  for (const entityId of neighborEntities) {
    const entity = graph.entities.get(entityId)
    if (entity) {
      for (const doc of entity.documents) {
        expansionDocuments.add(doc)
      }
      foundEntityNames.push({
        name: entity.name,
        type: entity.type,
        documents: entity.documents,
      })
    }
  }

  const existingChunkIds = new Set(initialResults.map((r) => r.chunk.id))
  const expansionChunks = allChunks.filter(
    (c) => expansionDocuments.has(c.filename) && !existingChunkIds.has(c.id)
  )

  const filenameToEntityIds = new Map<string, string[]>()
  for (const [entityId, entity] of graph.entities) {
    for (const doc of entity.documents) {
      if (!filenameToEntityIds.has(doc)) filenameToEntityIds.set(doc, [])
      filenameToEntityIds.get(doc)!.push(entityId)
    }
  }

  const scoredExpansions = expansionChunks.map((chunk) => {
    let score = 0
    const entityIds = filenameToEntityIds.get(chunk.filename)
    if (entityIds) {
      for (const entityId of entityIds) {
        if (queryEntities.has(entityId)) score += 0.3
        if (neighborEntities.has(entityId)) score += 0.15
      }
    }
    score = Math.min(score, 1.0)
    return { chunk, score }
  })

  scoredExpansions.sort((a, b) => b.score - a.score)
  const selected = scoredExpansions.slice(0, maxExpansions)

  const expansionResults: SearchResult[] = selected
    .filter((s) => s.score > 0)
    .map((s) => ({
      chunk: s.chunk,
      score: s.score * 0.3,
      source: "hybrid" as const,
    }))

  return {
    results: expansionResults,
    entities: foundEntityNames.slice(0, 10),
  }
}

// ─── 图谱持久化 ───

const GRAPH_FILE = "graph.json"

const graphCache = new Map<string, { graph: KnowledgeGraph; loadedAt: number }>()
const GRAPH_CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

function graphCacheKey(userId: string, projectId: string): string {
  return `${userId}/${projectId}`
}

export async function saveKnowledgeGraph(
  userId: string,
  projectId: string,
  graph: KnowledgeGraph
): Promise<void> {
  const serializable = {
    entities: Array.from(graph.entities.values()),
    relations: graph.relations,
  }
  const json = JSON.stringify(serializable)
  const compressed = await gzipAsync(Buffer.from(json, "utf-8"), { level: 6 })
  await storageWrite(
    `${userProjectPrefix(userId, projectId)}.rag/${GRAPH_FILE}.gz`,
    compressed,
    { contentType: "application/gzip" }
  )
  graphCache.delete(graphCacheKey(userId, projectId))
}

export async function loadKnowledgeGraph(
  userId: string,
  projectId: string
): Promise<KnowledgeGraph | null> {
  const key = graphCacheKey(userId, projectId)
  const cached = graphCache.get(key)
  if (cached && Date.now() - cached.loadedAt < GRAPH_CACHE_TTL_MS) {
    return cached.graph
  }

  try {
    const prefix = `${userProjectPrefix(userId, projectId)}.rag/`
    let content: string | null = null
    const gzBuf = await readFileBuffer(`${prefix}${GRAPH_FILE}.gz`)
    if (gzBuf) {
      content = (await gunzipAsync(gzBuf)).toString("utf-8")
    } else {
      content = await readFile(`${prefix}${GRAPH_FILE}`)
    }
    if (!content) return null

    const data = JSON.parse(content) as {
      entities: GraphEntity[]
      relations: GraphRelation[]
    }

    const entities = new Map<string, GraphEntity>()
    for (const e of data.entities) {
      e.documentSet = new Set(e.documents)
      entities.set(e.id, e)
    }

    const graph: KnowledgeGraph = {
      entities,
      relations: data.relations || [],
    }

    graphCache.set(key, { graph, loadedAt: Date.now() })
    return graph
  } catch {
    return null
  }
}
