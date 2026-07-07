/**
 * Search Node — 对子问题执行联网搜索，收集来源
 */

import type { DeepResearchState, SearchResult, Source, SubQuestion } from '../types'

/** 调用 Tavily 搜索 API */
async function tavilySearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    console.warn('[Search] TAVILY_API_KEY 未配置，跳过联网搜索')
    return []
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(maxResults, 10),
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: true,
        include_images: false,
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (!res.ok) {
      console.error(`[Search] Tavily API 失败: ${res.status}`)
      return []
    }

    const data = await res.json()
    const results = data.results || []

    return results.map((r: { title?: string; url?: string; content?: string; raw_content?: string; score?: number }, i: number) => {
      // 优先使用 raw_content（完整正文），截取前 1500 字；否则回退到 content（摘要）
      const body = (r.raw_content && r.raw_content.length > 200)
        ? r.raw_content.slice(0, 1500)
        : (r.content || '')
      return {
        url: r.url || '',
        title: r.title || `结果 ${i + 1}`,
        content: body,
        relevanceScore: r.score || 0.5,
        subQuestionId: '',
      }
    })
  } catch (err) {
    console.error(`[Search] Tavily API 网络错误:`, err instanceof Error ? err.message : err)
    return []
  }
}

/** 对单个 URL 使用 Jina Reader 抓取正文 */
async function scrapeUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return ''
    const text = await res.text()
    // 截取前 8000 字符，为 LLM 和最终报告提供充分素材
    return text.slice(0, 8000)
  } catch {
    return ''
  }
}

export async function searchNode(
  state: DeepResearchState
): Promise<Partial<DeepResearchState>> {
  const pendingQuestions = state.subQuestions.filter(q => q.status === 'pending')
  // 每轮最多处理 3 个子问题，避免单轮耗时过长
  const batch = pendingQuestions.slice(0, 3)
  const newResults: SearchResult[] = []
  const newSources: Source[] = [...state.sources]

  // 并行搜索所有子问题（使用 allSettled 避免单个失败导致全部中断）
  const searchPromises = batch.map(sq => tavilySearch(sq.question, 3))
  const settled = await Promise.allSettled(searchPromises)
  const searchResults = settled.map(r => r.status === 'fulfilled' ? r.value : [])

  // 并行抓取正文（每题最多 1 个 URL）
  for (let i = 0; i < batch.length; i++) {
    const sq = batch[i]
    const results = searchResults[i]

    // 对第 1 个结果抓取正文
    if (results[0]) {
      const fullContent = await scrapeUrl(results[0].url)
      if (fullContent) {
        results[0].content = fullContent
      }
    }

    // 标记来源
    for (const r of results) {
      r.subQuestionId = sq.id
      newResults.push(r)
      // 去重添加来源
      if (!newSources.find(s => s.url === r.url)) {
        newSources.push({
          url: r.url,
          title: r.title,
          type: 'web' as const,
        })
      }
    }
  }

  // 更新子问题状态
  const updatedSubQuestions: SubQuestion[] = state.subQuestions.map(q =>
    q.status === 'pending'
      ? { ...q, status: 'done' as const, searchResults: newResults.filter(r => r.subQuestionId === q.id) }
      : q
  )

  const totalSearched = state.subQuestions.filter(q => q.status === 'done').length + pendingQuestions.length
  const totalQuestions = state.subQuestions.length

  return {
    subQuestions: updatedSubQuestions,
    searchResults: [...state.searchResults, ...newResults],
    sources: newSources,
    iterationCount: state.iterationCount + 1,
    streaming: {
      ...state.streaming,
      currentPhase: 'search',
      currentStep: `已搜索 ${totalSearched}/${totalQuestions} 个子问题，收集 ${newSources.length} 个来源`,
      progress: Math.min(20 + state.iterationCount * 15, 60),
      log: [...state.streaming.log, `[Search] 第 ${state.iterationCount + 1} 轮: 搜索 ${pendingQuestions.length} 个子问题，新增 ${newResults.length} 条结果`],
    },
  }
}
