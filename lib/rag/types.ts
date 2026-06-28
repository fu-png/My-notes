/**
 * RAG 系统公共类型定义
 */

/** 文本分块 */
export interface Chunk {
  id: string
  /** 所属文件名 */
  filename: string
  /** 文件标题（去掉扩展名） */
  fileTitle: string
  /** 块内容（纯文本） */
  content: string
  /** 块在原文中的起始行号（1-based） */
  startLine: number
  /** 块在原文中的结束行号（1-based） */
  endLine: number
  /** 块所在的 Markdown 标题层级路径，如 ["# 概述", "## 核心概念"] */
  headingPath: string[]
  /** 块的 token 数估算 */
  tokenCount: number
}

/** 检索结果 */
export interface SearchResult {
  chunk: Chunk
  /** 综合相关度得分（0-1） */
  score: number
  /** 来源标识（用于引用标注） */
  source: "vector" | "bm25" | "hybrid"
}

/** RAG 配置 */
export interface RAGConfig {
  /** OpenAI 兼容 API 的 base URL */
  apiBase: string
  /** API Key */
  apiKey: string
  /** Embedding 模型名称 */
  embeddingModel: string
  /** 对话模型名称（用于查询分解） */
  chatModel: string
  /** 上下文组装的最大 token 数 */
  maxContextTokens?: number
}

/** 查询分解结果 */
export interface DecomposedQuery {
  /** 原始用户问题 */
  original: string
  /** 分解后的子查询列表 */
  subQueries: string[]
  /** LLM 的推理说明 */
  reasoning: string
}

/** 组装好的上下文 */
export interface AssembledContext {
  /** 格式化后的上下文文本（直接注入 system prompt） */
  text: string
  /** 使用的检索结果（用于前端展示引用） */
  sources: ContextSource[]
  /** 总 token 数 */
  totalTokens: number
}

/** 上下文来源（用于引用展示） */
export interface ContextSource {
  filename: string
  fileTitle: string
  headingPath: string[]
  /** 片段摘要（前 100 字符） */
  snippet: string
  score: number
}

/** 项目索引状态 */
export interface IndexStatus {
  /** 是否已建立索引 */
  indexed: boolean
  /** 索引的文件数量 */
  totalFiles?: number
  /** 总分块数量 */
  totalChunks?: number
  /** 上次索引时间 */
  lastIndexedAt?: string | null
}
