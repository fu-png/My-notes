/**
 * Graph RAG — 实体-关系图谱
 *
 * 在传统向量+BM25 检索之上，构建文档间的实体-关系图谱。
 * 当用户查询涉及跨文档多跳推理时，通过图谱扩展检索范围。
 *
 * 基础版策略：
 * 1. 索引时：从 Markdown 文档中抽取实体（名词短语）和关系（共现 + Wiki 链接）
 * 2. 查询时：从检索结果中提取实体 → 在图谱中查找相邻实体 → 拉取相关文档块
 * 3. 将图谱扩展结果与原始检索结果融合
 */

import type { Chunk, SearchResult } from "./types"
import { readFile, writeFile as storageWrite } from "../storage"

// ─── 类型定义 ───

export interface GraphEntity {
  id: string
  name: string
  type: "concept" | "person" | "org" | "tech" | "other"
  /** 出现在哪些文档中 */
  documents: string[]
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
  /** 实体名 → 实体 ID 的映射（支持模糊查找） */
  nameIndex: Map<string, string[]>
}

export interface GraphSearchResult {
  /** 扩展的检索结果 */
  results: SearchResult[]
  /** 图谱中找到的实体（用于前端展示） */
  entities: { name: string; type: string; documents: string[] }[]
}

// ─── 实体抽取 ───

/** Markdown 中常见的 Wiki 链接 [[实体名]] */
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g

/** Markdown 链接 [文本](url) 中的文本部分也可作为实体 */
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g

/** 代码反引号中的技术名词 */
const CODE_REF_RE = /`([^`]{2,30})`/g

/** 中英文专有名词模式：大写英文缩写、中文+英文混合等 */
const PROPER_NOUN_RE = /(?:[A-Z][a-z]+(?:\s[A-Z][a-z]+)+)|(?:[A-Z]{2,6}(?=\s|[，。、）]))/g

/** 加粗文本 **实体** */
const BOLD_RE = /\*\*([^*]{2,30})\*\*/g

/**
 * 从文本块中抽取实体候选
 */
function extractEntities(text: string): string[] {
  const entities = new Set<string>()

  // Wiki 链接 [[实体名]]
  for (const m of text.matchAll(WIKI_LINK_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30) entities.add(name)
  }

  // Markdown 链接文本
  for (const m of text.matchAll(MD_LINK_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30) entities.add(name)
  }

  // 代码引用 `技术名词`
  for (const m of text.matchAll(CODE_REF_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30) entities.add(name)
  }

  // 加粗文本
  for (const m of text.matchAll(BOLD_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30) entities.add(name)
  }

  // 专有名词
  for (const m of text.matchAll(PROPER_NOUN_RE)) {
    const name = m[0].trim()
    if (name.length >= 2 && name.length <= 30) entities.add(name)
  }

  // Markdown 标题作为实体
  const headingMatch = text.match(/^#{1,3}\s+(.+)$/gm)
  if (headingMatch) {
    for (const h of headingMatch) {
      const name = h.replace(/^#{1,3}\s+/, "").trim()
      if (name.length >= 2 && name.length <= 30) entities.add(name)
    }
  }

  return Array.from(entities)
}

/** 推断实体类型 */
function inferEntityType(name: string): GraphEntity["type"] {
  // 纯大写 → 技术缩写
  if (/^[A-Z]{2,6}$/.test(name)) return "tech"
  // 包含中文人名常见姓氏
  if (/^[张王李赵刘陈杨黄周吴徐孙马朱胡郭林何高梁郑罗宋谢唐韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤]/.test(name) && name.length <= 4) return "person"
  // 公司/组织关键词
  if (/(公司|集团|团队|组织|部门|委员会|大学|学院|研究所|实验室)/.test(name)) return "org"
  // 技术关键词
  if (/(AI|LLM|API|SDK|GPT|RAG|Graph|Vector|Embedding|Token|Model|Transformer|Attention|Framework|React|Vue|Node|Python|Java|TypeScript|JavaScript|Docker|Kubernetes)/i.test(name)) return "tech"
  return "concept"
}

// ─── 图谱构建 ───

/**
 * 从文档分块列表构建知识图谱
 */
export function buildKnowledgeGraph(chunks: Chunk[]): KnowledgeGraph {
  const entities = new Map<string, GraphEntity>()
  const relations: GraphRelation[] = []
  // 关系快速查找索引：key = "entityA|entityB"（字典序排列保证唯一）
  const relationIndex = new Map<string, number>()

  // 实体名归一化（小写）
  const normalizeName = (name: string) => name.toLowerCase().trim()

  // 生成关系 key：两个实体名按字典序排列，保证 (a,b) 和 (b,a) 映射到同一 key
  const makeRelationKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`

  for (const chunk of chunks) {
    const chunkEntities = extractEntities(chunk.content)

    // 注册实体
    for (const name of chunkEntities) {
      const normalized = normalizeName(name)
      const existing = entities.get(normalized)

      if (existing) {
        if (!existing.documents.includes(chunk.filename)) {
          existing.documents.push(chunk.filename)
        }
        existing.frequency++
      } else {
        const entity: GraphEntity = {
          id: normalized,
          name,
          type: inferEntityType(name),
          documents: [chunk.filename],
          frequency: 1,
        }
        entities.set(normalized, entity)
      }
    }

    // 共现关系：同一 chunk 中的实体两两建立关系
    // 使用 Map 索引替代 Array.find()，从 O(n²×m) 降低到 O(n²)
    for (let i = 0; i < chunkEntities.length; i++) {
      for (let j = i + 1; j < chunkEntities.length; j++) {
        const a = normalizeName(chunkEntities[i])
        const b = normalizeName(chunkEntities[j])
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

  // nameIndex 不再构建（原实现构建了但从未被查询使用，属于死代码）
  // expandWithGraph 使用 entities.get(normalized) 直接精确查找
  const nameIndex = new Map<string, string[]>()

  return { entities, relations, nameIndex }
}

// ─── 图谱查询 ───

/**
 * 从检索结果中提取实体，并在图谱中查找相邻实体，
 * 拉取相关文档块作为扩展检索结果。
 */
export function expandWithGraph(
  initialResults: SearchResult[],
  graph: KnowledgeGraph,
  allChunks: Chunk[],
  maxExpansions: number = 5
): GraphSearchResult {
  if (graph.entities.size === 0) {
    return { results: [], entities: [] }
  }

  // 1. 从初始检索结果中提取实体
  const queryEntities = new Set<string>()
  const foundEntityNames: { name: string; type: string; documents: string[] }[] = []

  for (const result of initialResults) {
    const entities = extractEntities(result.chunk.content)
    for (const name of entities) {
      const normalized = name.toLowerCase().trim()
      const entity = graph.entities.get(normalized)
      if (entity) {
        queryEntities.add(normalized)
        foundEntityNames.push({
          name: entity.name,
          type: entity.type,
          documents: entity.documents,
        })
      }
    }
  }

  if (queryEntities.size === 0) {
    return { results: [], entities: [] }
  }

  // 2. 在图谱中查找相邻实体（1-hop expansion）
  const neighborEntities = new Set<string>()
  for (const relation of graph.relations) {
    if (queryEntities.has(relation.source) && !queryEntities.has(relation.target)) {
      neighborEntities.add(relation.target)
    }
    if (queryEntities.has(relation.target) && !queryEntities.has(relation.source)) {
      neighborEntities.add(relation.source)
    }
  }

  // 3. 找到相邻实体所在的文档
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

  // 4. 从这些文档中拉取相关 chunk（排除已有结果）
  const existingChunkIds = new Set(initialResults.map((r) => r.chunk.id))
  const expansionChunks = allChunks.filter(
    (c) => expansionDocuments.has(c.filename) && !existingChunkIds.has(c.id)
  )

  // 5. 限制扩展数量，优先选择与查询实体相关的 chunk
  const scoredExpansions = expansionChunks.map((chunk) => {
    const chunkEntities = extractEntities(chunk.content)
    let score = 0
    for (const name of chunkEntities) {
      const normalized = name.toLowerCase().trim()
      if (queryEntities.has(normalized)) score += 0.3
      if (neighborEntities.has(normalized)) score += 0.15
    }
    return { chunk, score }
  })

  scoredExpansions.sort((a, b) => b.score - a.score)
  const selected = scoredExpansions.slice(0, maxExpansions)

  const expansionResults: SearchResult[] = selected
    .filter((s) => s.score > 0)
    .map((s) => ({
      chunk: s.chunk,
      score: s.score * 0.5, // 扩展结果降权
      source: "hybrid" as const,
    }))

  return {
    results: expansionResults,
    entities: foundEntityNames.slice(0, 10), // 最多展示 10 个实体
  }
}

// ─── 图谱持久化 ───

const GRAPH_FILE = "graph.json"

export async function saveKnowledgeGraph(
  projectId: string,
  graph: KnowledgeGraph
): Promise<void> {
  // 序列化 Map → Array
  const serializable = {
    entities: Array.from(graph.entities.values()),
    relations: graph.relations,
    nameIndex: Array.from(graph.nameIndex.entries()),
  }
  await storageWrite(
    `projects/${projectId}/.rag/${GRAPH_FILE}`,
    JSON.stringify(serializable, null, 2),
    { contentType: "application/json" }
  )
}

export async function loadKnowledgeGraph(
  projectId: string
): Promise<KnowledgeGraph | null> {
  try {
    const content = await readFile(`projects/${projectId}/.rag/${GRAPH_FILE}`)
    if (!content) return null

    const data = JSON.parse(content) as {
      entities: GraphEntity[]
      relations: GraphRelation[]
      nameIndex: [string, string[]][]
    }

    const entities = new Map<string, GraphEntity>()
    for (const e of data.entities) {
      entities.set(e.id, e)
    }

    const nameIndex = new Map<string, string[]>()
    for (const [key, value] of data.nameIndex) {
      nameIndex.set(key, value)
    }

    return {
      entities,
      relations: data.relations || [],
      nameIndex,
    }
  } catch {
    return null
  }
}
