/**
 * Agent Reach API 路由 — 对应原 Next.js 的 app/api/agent-reach/route.ts
 *
 * 为 AI 助手提供互联网内容获取能力。纯 HTTP 实现，无 CLI 依赖。
 * 支持的 action：
 *  - search: 全网搜索（Tavily Search API）
 *  - web: 读取指定 URL 的网页内容（Jina Reader）
 *  - youtube: 提取 YouTube 视频信息（通过 Jina Reader）
 *  - github: 读取 GitHub 仓库信息（GitHub REST API）
 *  - bilibili: 搜索 B 站内容
 *
 * 迁移说明：逻辑纯平移；限流由按 IP 改为按 userId（鉴权后更可靠的身份标识）。
 */

import type { FastifyInstance } from "fastify"
import { getAuthContext } from "../../lib/auth-context.js"
import { isSafeExternalUrl } from "../../lib/validation.js"

// Agent Reach 速率限制（每 userId 每分钟最多 20 次）
const agentReachRateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkAgentReachRateLimit(userId: string): boolean {
  const now = Date.now()
  if (agentReachRateLimitMap.size > 1000) {
    for (const [key, val] of agentReachRateLimitMap) {
      if (now > val.resetAt) agentReachRateLimitMap.delete(key)
    }
  }
  const entry = agentReachRateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    agentReachRateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= 20
}

interface AgentReachBody {
  action?: string
  query?: string
  url?: string
  count?: number
}

export default async function agentReachRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: AgentReachBody }>(
    "/agent-reach",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { userId } = getAuthContext(request)
      if (!checkAgentReachRateLimit(userId)) {
        return reply.code(429).send({ error: "请求过于频繁，请稍后重试" })
      }

      const { action, query, url, count } = request.body ?? {}

      if (!action) {
        return reply.code(400).send({ error: "缺少 action 参数" })
      }

      let result: string

      try {
        switch (action) {
          case "search": {
            if (!query) {
              return reply.code(400).send({ error: "搜索需要 query 参数" })
            }
            result = await tavilySearch(query, count || 5)
            break
          }

          case "web": {
            if (!url) {
              return reply.code(400).send({ error: "网页读取需要 url 参数" })
            }
            if (!isSafeExternalUrl(url)) {
              return reply.code(400).send({ error: "不允许访问内部网络地址" })
            }
            result = await jinaRead(url)
            break
          }

          case "youtube": {
            if (!url) {
              return reply.code(400).send({ error: "YouTube 需要 url 参数" })
            }
            if (!isSafeExternalUrl(url)) {
              return reply.code(400).send({ error: "不允许访问内部网络地址" })
            }
            result = await jinaRead(url)
            break
          }

          case "github": {
            if (!query) {
              return reply.code(400).send({ error: "GitHub 需要 query 参数（仓库名或搜索词）" })
            }
            result = await githubSearch(query, count || 5)
            break
          }

          case "bilibili": {
            if (!query && !url) {
              return reply.code(400).send({ error: "B站搜索需要 query 或 url 参数" })
            }
            if (url) {
              if (!isSafeExternalUrl(url)) {
                return reply.code(400).send({ error: "不允许访问内部网络地址" })
              }
              result = await jinaRead(url)
            } else {
              result = await bilibiliSearch(query!, count || 5)
            }
            break
          }

          default:
            return reply.code(400).send({ error: `不支持的 action: ${action}` })
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "未知错误"
        return reply.code(500).send({ error: `Agent Reach 调用失败: ${message}` })
      }

      // 截断过长的结果（避免超出 token 限制）
      const maxLen = 15000
      const truncated = result.length > maxLen
      const content = truncated ? result.slice(0, maxLen) + "\n\n[内容过长已截断...]" : result

      return {
        success: true,
        action,
        content,
        truncated,
        originalLength: result.length,
      }
    }
  )
}

// ─── Tavily Search (REST API, 免费额度 1000 次/月) ───

async function tavilySearch(query: string, maxResults: number): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error("未配置 TAVILY_API_KEY 环境变量。请前往 https://app.tavily.com 获取免费 API Key，然后在部署环境变量中添加。")
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: Math.min(maxResults, 10),
      search_depth: "basic",
      include_answer: true,
      include_raw_content: false,
      include_images: false,
    }),
    signal: AbortSignal.timeout(25000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`Tavily API 请求失败 (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string; score?: number }[]
    answer?: string
  }
  const results = data.results || []

  if (results.length === 0 && !data.answer) {
    return `没有找到与「${query}」相关的搜索结果。`
  }

  const parts: string[] = []

  if (data.answer) {
    parts.push(`**摘要**: ${data.answer}`)
    parts.push("")
  }

  if (results.length > 0) {
    parts.push(`搜索「${query}」的结果（共 ${results.length} 条）：`)
    parts.push("")

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const lines = [`${i + 1}. ${r.title || "无标题"}`]
      if (r.url) lines.push(`   URL: ${r.url}`)
      if (r.content) lines.push(`   内容: ${r.content.slice(0, 600)}`)
      parts.push(lines.join("\n"))
    }
  }

  return parts.join("\n")
}

// ─── Jina Reader ───

async function jinaRead(targetUrl: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
    headers: {
      Accept: "text/plain",
    },
    signal: AbortSignal.timeout(25000),
  })

  if (!res.ok) {
    throw new Error(`Jina Reader 请求失败 (${res.status})`)
  }

  const text = await res.text()
  return text || "(页面内容为空)"
}

// ─── GitHub Search (REST API, no auth needed for public) ───

async function githubSearch(query: string, count: number): Promise<string> {
  if (query.includes("/")) {
    const res = await fetch(`https://api.github.com/repos/${query}`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "MyNotes-Agent" },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      throw new Error(`GitHub API 请求失败 (${res.status})`)
    }
    const repo = (await res.json()) as {
      full_name?: string
      description?: string
      language?: string
      stargazers_count?: number
      forks_count?: number
      created_at?: string
      updated_at?: string
      homepage?: string
      html_url?: string
    }
    return [
      `仓库: ${repo.full_name}`,
      `描述: ${repo.description || "无"}`,
      `语言: ${repo.language || "未知"}`,
      `Stars: ${repo.stargazers_count} | Forks: ${repo.forks_count}`,
      `创建时间: ${repo.created_at}`,
      `最后更新: ${repo.updated_at}`,
      `主页: ${repo.homepage || "无"}`,
      `链接: ${repo.html_url}`,
    ].join("\n")
  } else {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=${count}`,
      {
        headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "MyNotes-Agent" },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) {
      throw new Error(`GitHub 搜索失败 (${res.status})`)
    }
    const data = (await res.json()) as {
      items?: { full_name?: string; description?: string; stargazers_count?: number; language?: string; html_url?: string }[]
    }
    const items = data.items || []
    if (items.length === 0) return `没有找到与「${query}」相关的 GitHub 仓库。`

    return items
      .map(
        (r, i) =>
          `${i + 1}. ${r.full_name} ⭐${r.stargazers_count}\n   ${r.description || "无描述"}\n   语言: ${r.language || "未知"} | ${r.html_url}`
      )
      .join("\n\n")
  }
}

// ─── Bilibili Search ───

async function bilibiliSearch(query: string, count: number): Promise<string> {
  const encodedQuery = encodeURIComponent(query)
  const res = await fetch(
    `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodedQuery}&page=1&page_size=${count}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
      },
      signal: AbortSignal.timeout(15000),
    }
  )

  if (!res.ok) {
    throw new Error(`B站搜索请求失败 (${res.status})`)
  }

  const data = (await res.json()) as {
    code?: number
    message?: string
    data?: { result?: { result_type?: string; data?: unknown[] }[] }
  }
  if (data.code !== 0) {
    return `B站搜索失败: ${data.message || "未知错误"}`
  }

  const resultTypes = data.data?.result || []
  const videoType = resultTypes.find((t) => t.result_type === "video")
  const videos = (videoType?.data || []) as {
    title?: string
    author?: string
    play?: number
    description?: string
    arcurl?: string
  }[]

  if (videos.length === 0) {
    return `没有找到与「${query}」相关的B站视频。`
  }

  return videos
    .slice(0, count)
    .map((v, i) => {
      const title = (v.title || "").replace(/<[^>]+>/g, "")
      return `${i + 1}. ${title}\n   UP主: ${v.author || "未知"} | 播放: ${v.play || 0}\n   简介: ${(v.description || "").slice(0, 100)}\n   链接: ${v.arcurl || ""}`
    })
    .join("\n\n")
}
