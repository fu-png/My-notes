/**
 * Deep Research State 类型定义
 *
 * 在 LangGraph 各节点间传递的状态数据结构
 *
 * 迁移自 apps/web/lib/deep-research/types.ts
 * 改动：DeepResearchState 新增 userId 字段，用于在 Save 节点中按用户隔离存储路径
 */

// ─── 核心状态 ────────────────────────────────────────────────────

export interface DeepResearchState {
  // ─── 输入 ───
  userQuery: string
  projectId?: string

  // ─── 用户身份（SaaS 多租户隔离） ───
  userId: string

  // ─── Plan 阶段产出 ───
  learningPath: LearningPathItem[]
  subQuestions: SubQuestion[]

  // ─── Search 阶段产出 ───
  searchResults: SearchResult[]
  sources: Source[]

  // ─── Reflect 阶段产出 ───
  coverage: number
  knowledgeGaps: string[]
  isSufficient: boolean

  // ─── Synthesize 阶段产出 ───
  synthesizedDocs: SynthesizedDoc[]

  // ─── Save 阶段产出 ───
  savedProjectId: string
  savedFileCount: number

  // ─── 流式输出 ───
  streaming: StreamingState

  // ─── 迭代控制 ───
  iterationCount: number
  maxIterations: number

  // ─── LLM 配置 ───
  apiKey: string
  apiBase: string
  model: string
}

export interface StreamingState {
  currentPhase: ResearchPhase
  currentStep: string
  progress: number
  log: string[]
}

export type ResearchPhase = 'plan' | 'search' | 'reflect' | 'synthesize' | 'save' | 'complete'

// ─── 数据结构 ────────────────────────────────────────────────────

export interface LearningPathItem {
  stage: string
  topics: string[]
  order: number
}

export interface SubQuestion {
  id: string
  question: string
  status: 'pending' | 'searching' | 'done'
  searchResults?: SearchResult[]
}

export interface SearchResult {
  url: string
  title: string
  content: string
  relevanceScore: number
  subQuestionId: string
}

export interface Source {
  url: string
  title: string
  type: 'web' | 'doc' | 'tutorial' | 'video'
}

export interface SynthesizedDoc {
  filename: string
  title: string
  content: string
  stage: string
  sources: Source[]
}

// ─── SSE 事件 ────────────────────────────────────────────────────

/** 每个研究阶段的执行详情 */
export interface ResearchStepDetail {
  /** 智能体/节点名称 */
  agent: string
  /** 阶段中文标签 */
  agentLabel: string
  /** 执行内容的结构化摘要 */
  summary?: string
  /** Plan 阶段：规划的子问题列表 */
  subQuestions?: string[]
  /** Plan 阶段：学习路径 */
  learningPath?: { stage: string; topics: string[] }[]
  /** Search 阶段：搜索的来源 */
  sources?: { url: string; title: string }[]
  /** Search 阶段：第几轮搜索 */
  searchRound?: number
  /** Reflect 阶段：覆盖度评分 */
  coverage?: number
  /** Reflect 阶段：知识盲区 */
  knowledgeGaps?: string[]
  /** Reflect 阶段：是否知识充分 */
  isSufficient?: boolean
  /** Synthesize 阶段：生成的文档标题列表 */
  docTitles?: string[]
  /** Save 阶段：保存的文件数 */
  savedFileCount?: number
}

export interface SSEProgressEvent {
  type: 'progress'
  phase: ResearchPhase
  step: string
  progress: number
  /** 该阶段的执行详情 */
  detail?: ResearchStepDetail
}

export interface SSECompleteEvent {
  type: 'complete'
  projectId: string
  fileCount: number
  message: string
}

export interface SSEErrorEvent {
  type: 'error'
  message: string
  detail?: string
}

export type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent

// ─── 辅助函数 ────────────────────────────────────────────────────

export function createInitialState(
  query: string,
  config: { apiKey: string; apiBase: string; model: string; projectId?: string; userId: string }
): DeepResearchState {
  return {
    userQuery: query,
    projectId: config.projectId,
    userId: config.userId,
    learningPath: [],
    subQuestions: [],
    searchResults: [],
    sources: [],
    coverage: 0,
    knowledgeGaps: [],
    isSufficient: false,
    synthesizedDocs: [],
    savedProjectId: '',
    savedFileCount: 0,
    streaming: {
      currentPhase: 'plan',
      currentStep: '',
      progress: 0,
      log: [],
    },
    iterationCount: 0,
    maxIterations: 2,
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    model: config.model,
  }
}
