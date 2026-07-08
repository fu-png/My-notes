/**
 * Save Node — 将生成的笔记 + 搜索来源文档保存到项目存储
 *
 * 迁移说明：原来直接调用 @/lib/storage 的 createProject/writeFile，
 * 现改为通过 api-proxy 调用后端 API。
 */

import type { DeepResearchState } from '../types'
import { fetchFromBackend } from '@/lib/api-proxy'

/**
 * 将 URL 来源标题转为合法文件名
 * 去除特殊字符，截断长度，保证不重复
 */
function sanitizeFilename(title: string, index: number): string {
  const clean = title
    .replace(/[\/\\:*?"<>|#%&{}$!@`=+^~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return clean || `参考来源 ${index + 1}`
}

/**
 * 使用 Jina Reader 抓取 URL 的完整正文（Markdown 格式）
 * 不截断，尽量获取完整内容
 */
async function fetchFullContent(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Timeout': '25',
      },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      console.error(`[Save] Jina Reader 失败 (${res.status}): ${url}`)
      return ''
    }
    const text = await res.text()
    // 清理 Jina 返回的头部元信息（Title:, URL:, 等行）
    const cleaned = text.replace(/^(Title|URL|Published Time|Markdown Content):\s*.*\n/gm, '').trim()
    return cleaned
  } catch (err) {
    console.error(`[Save] Jina Reader 抓取失败:`, url, err instanceof Error ? err.message : err)
    return ''
  }
}

/**
 * 使用 Tavily Extract API 获取 URL 完整正文（作为 Jina Reader 的备选）
 */
async function fetchViaTavily(url: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return ''

  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ urls: [url] }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const result = data.results?.[0]
    return result?.raw_content || result?.text || ''
  } catch {
    return ''
  }
}

/**
 * 将搜索到的 URL 内容格式化为 Markdown 笔记
 */
function formatSourceAsMarkdown(
  title: string,
  url: string,
  content: string,
): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`> 来源：[${url}](${url})`)
  lines.push('')
  lines.push('---')
  lines.push('')

  if (content) {
    lines.push(content)
  } else {
    lines.push('*（未能获取到页面正文内容）*')
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * 通过后端 API 写入文件到项目
 */
async function writeFileToProject(projectId: string, filename: string, content: string): Promise<void> {
  await fetchFromBackend(`/projects/${projectId}/files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: { content },
  })
}

export async function saveNode(
  state: DeepResearchState
): Promise<Partial<DeepResearchState>> {
  const { synthesizedDocs, userQuery, projectId, sources, searchResults } = state

  // 确定目标项目 ID
  let targetProjectId = projectId

  if (!targetProjectId) {
    const projectName = `${userQuery.slice(0, 30)} - 深度研究`
    const { data } = await fetchFromBackend<{ success: boolean; project: { id: string } }>(
      '/projects',
      { method: 'POST', body: { name: projectName } }
    )
    if (!data?.project?.id) {
      throw new Error('[Save] 创建项目失败')
    }
    targetProjectId = data.project.id
  }

  let fileCount = 0

  // 1. 写入 AI 生成的综合笔记
  for (const doc of synthesizedDocs) {
    await writeFileToProject(targetProjectId, doc.filename, doc.content)
    fileCount++
  }

  // 2. 对每个搜索来源 URL，重新抓取完整正文并保存为独立文档
  const savedUrls = new Set<string>()
  const urlsToFetch: { source: typeof sources[0]; index: number }[] = []

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    if (!source.url || savedUrls.has(source.url)) continue
    savedUrls.add(source.url)
    urlsToFetch.push({ source, index: i })
  }

  // 并行抓取所有 URL 的完整正文（使用 allSettled 避免单个失败影响其他）
  const fetchPromises = urlsToFetch.map(({ source }) => fetchFullContent(source.url))
  const fetchResults = await Promise.allSettled(fetchPromises)

  for (let j = 0; j < urlsToFetch.length; j++) {
    const { source, index } = urlsToFetch[j]
    const result = fetchResults[j]
    let content = result.status === 'fulfilled' ? result.value : ''

    // 如果 Jina Reader 抓取失败或内容太短，尝试 Tavily Extract API
    if (!content || content.trim().length < 500) {
      console.log(`[Save] Jina Reader 内容不足 (${content.trim().length} 字)，尝试 Tavily Extract: ${source.url}`)
      const tavilyExtract = await fetchViaTavily(source.url)
      if (tavilyExtract && tavilyExtract.trim().length > content.trim().length) {
        content = tavilyExtract
      }
    }

    // 如果仍然不足，回退到搜索阶段的缓存内容
    if (!content || content.trim().length < 200) {
      const searchResult = searchResults.find(r => r.url === source.url)
      if (searchResult?.content && searchResult.content.trim().length > content.trim().length) {
        content = searchResult.content
        console.log(`[Save] 回退到搜索缓存内容: ${source.url}`)
      }
    }

    // 格式化为 Markdown
    const markdown = formatSourceAsMarkdown(
      source.title || `参考来源 ${index + 1}`,
      source.url,
      content,
    )

    // 生成文件名
    const safeTitle = sanitizeFilename(source.title || '', index)
    const filename = `ref-${String(index + 1).padStart(2, '0')}-${safeTitle}.md`

    await writeFileToProject(targetProjectId, filename, markdown)
    fileCount++
  }

  return {
    savedProjectId: targetProjectId,
    savedFileCount: fileCount,
    streaming: {
      ...state.streaming,
      currentPhase: 'complete',
      currentStep: `已创建项目，保存 ${fileCount} 篇笔记（含 ${savedUrls.size} 篇参考来源）`,
      progress: 100,
      log: [...state.streaming.log, `[Save] 项目 ${targetProjectId}, ${fileCount} 篇文件（${synthesizedDocs.length} 篇笔记 + ${savedUrls.size} 篇参考来源）`],
    },
  }
}
