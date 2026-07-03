/**
 * Markdown-aware 文本分块器
 *
 * 策略：
 * 1. 优先按 Markdown 标题（## / ###）切分
 * 2. 超长段落按段落边界（\n\n）二次切分
 * 3. 仍然超长时按句子边界切分
 * 4. 每个 chunk 携带文件名、标题路径、行号等元数据
 */

import type { Chunk } from "./types"

// ─── 配置 ───

const DEFAULT_CHUNK_SIZE = 800 // tokens（增大块大小保留更多语义上下文）
const DEFAULT_CHUNK_OVERLAP = 0.15 // 15% overlap
const MIN_CHUNK_SIZE = 30 // 低于此值的碎片块丢弃

// 粗略估算 token 数：英文约 4 字符/token，中文约 1.5 字符/token
function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(ch)) {
      cjk++
    } else {
      other++
    }
  }
  return Math.ceil(cjk / 1.5 + other / 4)
}

// ─── 标题解析 ───

interface HeadingNode {
  level: number // 1-6
  title: string // 标题文本（不含 # 前缀）
  startLine: number
  endLine: number // 本节内容的结束行（不含下一个同级/更高级标题）
  content: string // 标题行 + 该节内容
}

/** 将 Markdown 按标题切分为节 */
function splitByHeadings(text: string): HeadingNode[] {
  const lines = text.split("\n")
  const nodes: HeadingNode[] = []

  let currentNode: HeadingNode | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headingMatch) {
      // 结束上一个节
      if (currentNode) {
        currentNode.endLine = i // 不含当前行
        currentNode.content = lines
          .slice(currentNode.startLine - 1, currentNode.endLine)
          .join("\n")
          .trim()
      }

      currentNode = {
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        startLine: i + 1, // 1-based
        endLine: lines.length,
        content: "",
      }
      nodes.push(currentNode)
    }
  }

  // 处理最后一个节
  if (currentNode) {
    currentNode.endLine = lines.length
    currentNode.content = lines
      .slice(currentNode.startLine - 1, currentNode.endLine)
      .join("\n")
      .trim()
  }

  // 如果没有任何标题，整个文档作为一个节
  if (nodes.length === 0) {
    nodes.push({
      level: 0,
      title: "",
      startLine: 1,
      endLine: lines.length,
      content: text.trim(),
    })
  }

  // 处理标题前的无标题内容
  if (nodes.length > 0 && nodes[0].startLine > 1) {
    const preContent = lines.slice(0, nodes[0].startLine - 1).join("\n").trim()
    if (preContent) {
      nodes.unshift({
        level: 0,
        title: "",
        startLine: 1,
        endLine: nodes[0].startLine - 1,
        content: preContent,
      })
    }
  }

  return nodes
}

/** 构建标题路径：从当前节向上回溯找到所有父标题 */
function buildHeadingPath(
  nodes: HeadingNode[],
  currentIndex: number
): string[] {
  const current = nodes[currentIndex]
  const path: string[] = []

  if (current.title) {
    path.unshift(`${"#".repeat(current.level)} ${current.title}`)
  }

  // 向前查找更高级的标题
  for (let i = currentIndex - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node.level > 0 && node.level < (current.level || 999)) {
      path.unshift(`${"#".repeat(node.level)} ${node.title}`)
      if (node.level === 1) break
    }
  }

  return path
}

// ─── 二次切分 ───

/** 按段落边界切分超长文本 */
function splitByParagraphs(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    const combined = current ? `${current}\n\n${para}` : para
    if (estimateTokens(combined) <= maxTokens) {
      current = combined
    } else {
      if (current) chunks.push(current)
      // 如果单个段落就超长，按句子切分
      if (estimateTokens(para) > maxTokens) {
        chunks.push(...splitBySentences(para, maxTokens))
      } else {
        current = para
      }
    }
  }
  if (current) chunks.push(current)

  return chunks
}

/** 按句子边界切分 */
function splitBySentences(text: string, maxTokens: number): string[] {
  // 中英文句子分隔
  const sentences = text.split(/(?<=[。！？.!?\n])\s*/)
  const chunks: string[] = []
  let current = ""

  for (const sent of sentences) {
    const combined = current ? `${current} ${sent}` : sent
    if (estimateTokens(combined) <= maxTokens) {
      current = combined
    } else {
      if (current) chunks.push(current)
      // 如果单个句子超过 maxTokens，按字符硬切分
      if (estimateTokens(sent) > maxTokens) {
        const maxChars = maxTokens * 3 // 粗略按 1 token ≈ 3 字符（兼顾中英文）
        for (let i = 0; i < sent.length; i += maxChars) {
          chunks.push(sent.slice(i, i + maxChars))
        }
        current = ""
      } else {
        current = sent
      }
    }
  }
  if (current) chunks.push(current)

  return chunks
}

/** 添加 overlap：将上一个 chunk 末尾的文本添加到下一个 chunk 开头 */
function addOverlap(texts: string[], overlapRatio: number): string[] {
  if (texts.length <= 1) return texts

  const result: string[] = [texts[0]]
  for (let i = 1; i < texts.length; i++) {
    const prev = texts[i - 1]
    const overlapChars = Math.floor(prev.length * overlapRatio)
    const overlapText = prev.slice(-overlapChars)
    // 在句子或段落边界处截断 overlap
    const boundary = overlapText.search(/[。！？.!?\n]\s*/)
    const cleanOverlap =
      boundary > 0 ? overlapText.slice(boundary + 1).trim() : overlapText
    result.push(cleanOverlap ? `${cleanOverlap}\n\n${texts[i]}` : texts[i])
  }

  return result
}

// ─── 主函数 ───

export interface ChunkerOptions {
  chunkSize?: number
  chunkOverlap?: number
  minChunkSize?: number
}

/**
 * 将单个文件的内容切分为 Chunk 数组
 */
export function chunkDocument(
  filename: string,
  content: string,
  options: ChunkerOptions = {}
): Chunk[] {
  const maxTokens = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlapRatio = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP
  const minTokens = options.minChunkSize ?? MIN_CHUNK_SIZE
  const fileTitle = filename.replace(/\.[^.]+$/, "")

  const sections = splitByHeadings(content)
  const rawChunks: {
    text: string
    headingPath: string[]
    startLine: number
    endLine: number
  }[] = []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const headingPath = buildHeadingPath(sections, i)

    if (estimateTokens(section.content) <= maxTokens) {
      rawChunks.push({
        text: section.content,
        headingPath,
        startLine: section.startLine,
        endLine: section.endLine,
      })
    } else {
      // 二次切分
      const subTexts = splitByParagraphs(section.content, maxTokens)
      const withOverlap = addOverlap(subTexts, overlapRatio)

      // 估算每个子块的行号范围
      let lineOffset = 0
      for (const subText of withOverlap) {
        const subLineCount = subText.split("\n").length
        rawChunks.push({
          text: subText,
          headingPath,
          startLine: section.startLine + lineOffset,
          endLine: Math.min(
            section.startLine + lineOffset + subLineCount - 1,
            section.endLine
          ),
        })
        // 前进时扣除 overlap 部分
        lineOffset += Math.max(
          1,
          subLineCount - Math.floor(subLineCount * overlapRatio)
        )
      }
    }
  }

  // 过滤碎片、生成最终 Chunk
  return rawChunks
    .filter((c) => estimateTokens(c.text) >= minTokens)
    .map((c, index) => ({
      id: `${filename}#${index}`,
      filename,
      fileTitle,
      content: c.text,
      startLine: c.startLine,
      endLine: c.endLine,
      headingPath: c.headingPath,
      tokenCount: estimateTokens(c.text),
    }))
}

/**
 * 批量切分多个文件
 */
export function chunkDocuments(
  files: { filename: string; content: string }[],
  options: ChunkerOptions = {}
): Chunk[] {
  return files.flatMap((f) => chunkDocument(f.filename, f.content, options))
}

export { estimateTokens }
