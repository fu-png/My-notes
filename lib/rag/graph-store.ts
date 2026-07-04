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
 * 停用词 / 结构性噪声词表
 *
 * 这些词虽然会被正则命中，但要么是文档的"结构性套话"（每一章/每一节都会出现，
 * 不携带跨文档语义关联），要么是 Mermaid 等图表 DSL 的语法关键字，要么是过于
 * 通用的技术缩写（几乎在任何技术文档里都会出现）。
 *
 * 如果不过滤，这些词会在知识图谱里变成连接几乎全部文档的"超级节点"（hub node），
 * 一旦查询结果里出现其中之一，Graph RAG 的 1-hop 扩展就会把几乎整个知识库都
 * 拉入上下文，完全稀释掉向量/BM25 检索原本精确的结果。
 */
const ENTITY_STOPWORDS = new Set(
  [
    // Mermaid / 图表 DSL 关键字（方向标记等），会被 PROPER_NOUN_RE 误判为专有名词
    "TD", "TB", "LR", "RL", "BT",
    // 文档结构性小节标题（几乎每章都重复出现，不构成有意义的跨文档实体关联）
    "学习目标：", "学习目标", "交叉引用：", "交叉引用", "最佳实践：", "最佳实践",
    "关键要点", "实战练习", "反模式警告：", "反模式警告", "本章小结", "小结",
    "章节导读", "延伸阅读", "参考资料", "练习", "总结", "思考题：", "思考题",
    "交叉引用提示：", "交叉引用提示",
    // 过于通用、几乎任意技术文档都会出现的缩写/词汇，作为图谱锚点没有区分度
    "API", "UI", "AI", "SDK", "CLI", "CI", "CD", "JSON", "URL", "ID",
    "HTTP", "HTTPS", "OS", "IO", "DB", "SQL",
  ].map((w) => w.toLowerCase())
)

/**
 * 单个实体最多允许出现在总文档数的这个比例中，超过则视为"过于通用"的超级节点。
 * 实际生效阈值取 (总文档数 × 该比例) 与 HUB_ENTITY_MIN_DOCUMENTS 中的较大者，
 * 避免文档数很少的小项目里，正常核心概念也被误判为超级节点。
 */
const MAX_ENTITY_DOCUMENT_RATIO = 0.3

/** 判断实体名是否为噪声词（停用词，或去除标点后命中停用词表） */
function isStopwordEntity(name: string): boolean {
  const normalized = name.toLowerCase().trim()
  if (ENTITY_STOPWORDS.has(normalized)) return true
  const stripped = normalized.replace(/[：:，,。.！!？?]+$/g, "")
  if (ENTITY_STOPWORDS.has(stripped)) return true
  return false
}

/**
 * 从文本块中抽取实体候选
 */
function extractEntities(text: string): string[] {
  const entities = new Set<string>()

  // Wiki 链接 [[实体名]]
  for (const m of text.matchAll(WIKI_LINK_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  // Markdown 链接文本
  for (const m of text.matchAll(MD_LINK_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  // 代码引用 `技术名词`
  for (const m of text.matchAll(CODE_REF_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  // 加粗文本
  for (const m of text.matchAll(BOLD_RE)) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  // 专有名词
  for (const m of text.matchAll(PROPER_NOUN_RE)) {
    const name = m[0].trim()
    if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
  }

  // Markdown 标题作为实体（排除纯结构性小节标题，如"学习目标"）
  const headingMatch = text.match(/^#{1,3}\s+(.+)$/gm)
  if (headingMatch) {
    for (const h of headingMatch) {
      const name = h.replace(/^#{1,3}\s+/, "").trim()
      if (name.length >= 2 && name.length <= 30 && !isStopwordEntity(name)) entities.add(name)
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
 * 实体最少需要出现在多少个文档中，才有资格被判定为"超级节点"而剔除。
 * 避免项目文档数很少时（如 2-3 个文件），阈值比例误伤正常的核心概念实体。
 */
const HUB_ENTITY_MIN_DOCUMENTS = 6

/**
 * 从文档分块列表构建知识图谱
 *
 * 分两遍扫描：
 * 1. 第一遍抽取全部候选实体及其出现的文档集合
 * 2. 根据文档总数计算 document-frequency 上限，剔除覆盖率过高的"超级节点"实体
 *    （如 "API"、"Claude Code" 这类几乎每章都出现的词），避免它们在图谱查询阶段
 *    把几乎全部文档都拉入 Graph RAG 扩展结果，稀释检索精度
 * 3. 第二遍只用保留下来的实体构建共现关系，超级节点不参与任何关系边
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

  // 预先抽取每个 chunk 的实体列表，避免正则重复执行两遍
  const chunkEntitiesList = chunks.map((chunk) => ({
    chunk,
    entityNames: extractEntities(chunk.content),
  }))

  // 第一遍：统计全部候选实体的文档覆盖情况
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
  }

  // 剔除"超级节点"：出现在文档数超过阈值的实体，对图谱扩展没有区分度，
  // 反而会在查询阶段把几乎全部文档拉入结果
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

  // 第二遍：只用保留下来的实体构建共现关系
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

  // 预构建邻接索引：entity ID → [{ target, weight }]，避免 O(E) 线性扫描
  const adjacency = new Map<string, { target: string; weight: number }[]>()
  for (const relation of graph.relations) {
    if (!adjacency.has(relation.source)) adjacency.set(relation.source, [])
    adjacency.get(relation.source)!.push({ target: relation.target, weight: relation.weight })
    // 双向索引
    if (!adjacency.has(relation.target)) adjacency.set(relation.target, [])
    adjacency.get(relation.target)!.push({ target: relation.source, weight: relation.weight })
  }

  // 1. 从初始检索结果中提取实体（通过图谱反向索引查找，而非重新抽取）
  // 优化：不再对每个 chunk 调用 extractEntities（该工作已在索引时完成），
  // 而是通过文件名匹配图谱中的实体，避免查询时重复运行正则抽取
  const queryEntities = new Set<string>()
  const foundEntityNames: { name: string; type: string; documents: string[] }[] = []

  // 收集初始结果涉及的文件名
  const initialFilenames = new Set(initialResults.map((r) => r.chunk.filename))

  // 遍历图谱实体，找出与初始结果文件相关的实体
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

  // 2. 在图谱中查找相邻实体（1-hop expansion），按共现权重排序后只取权重最高的若干个，
  //    避免命中多个查询实体时关系边数量叠加、间接引入过多文档
  //    使用邻接索引避免 O(E) 线性扫描所有关系
  const MAX_NEIGHBOR_ENTITIES = 20
  const neighborWeights = new Map<string, number>()
  for (const entityId of queryEntities) {
    // 从预构建的邻接表中查找邻居（O(degree) 而非 O(E)）
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

  // 5. 限制扩展数量，通过图谱反向索引匹配实体（而非重新抽取）
  const scoredExpansions = expansionChunks.map((chunk) => {
    // 通过文件名查找相关实体，而非对每个 chunk 重新运行正则抽取
    let score = 0
    for (const [entityId, entity] of graph.entities) {
      if (entity.documents.includes(chunk.filename)) {
        if (queryEntities.has(entityId)) score += 0.3
        if (neighborEntities.has(entityId)) score += 0.15
      }
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
    }

    const entities = new Map<string, GraphEntity>()
    for (const e of data.entities) {
      entities.set(e.id, e)
    }

    return {
      entities,
      relations: data.relations || [],
    }
  } catch {
    return null
  }
}
