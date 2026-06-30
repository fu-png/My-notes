import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export const maxDuration = 60

/**
 * Agent Reach API 路由
 *
 * 封装 agent-reach 上游工具调用，为 AI 助手提供互联网内容获取能力。
 * 支持的 action：
 *  - search: 全网语义搜索（Exa）
 *  - web: 读取指定 URL 的网页内容（Jina Reader）
 *  - youtube: 提取 YouTube 视频字幕
 *  - github: 读取 GitHub 仓库信息
 *  - bilibili: 搜索 B 站内容
 *  - rss: 读取 RSS 订阅源
 *  - doctor: 诊断各平台可用性
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, query, url, count } = body

    if (!action) {
      return NextResponse.json({ error: "缺少 action 参数" }, { status: 400 })
    }

    let result: string

    switch (action) {
      case "search": {
        if (!query) {
          return NextResponse.json({ error: "搜索需要 query 参数" }, { status: 400 })
        }
        const num = count || 5
        // 使用 mcporter 调用 Exa 搜索
        result = await runCommand(
          `mcporter call 'exa.web_search_exa(query: "${escapeShell(query)}", numResults: ${num})'`
        )
        break
      }

      case "web": {
        if (!url) {
          return NextResponse.json({ error: "网页读取需要 url 参数" }, { status: 400 })
        }
        // 使用 Jina Reader 读取网页
        result = await runCommand(
          `curl -s -m 30 "https://r.jina.ai/${escapeShell(url)}"`
        )
        break
      }

      case "youtube": {
        if (!url) {
          return NextResponse.json({ error: "YouTube 需要 url 参数" }, { status: 400 })
        }
        // 使用 yt-dlp 提取视频信息和字幕
        result = await runCommand(
          `yt-dlp --skip-download --print "Title: %(title)s\\nChannel: %(channel)s\\nDuration: %(duration_string)s\\nDescription: %(description).500s" "${escapeShell(url)}" 2>/dev/null`
        )
        break
      }

      case "github": {
        if (!query) {
          return NextResponse.json({ error: "GitHub 需要 query 参数（仓库名或搜索词）" }, { status: 400 })
        }
        // 判断是仓库路径还是搜索
        if (query.includes("/")) {
          result = await runCommand(`gh repo view "${escapeShell(query)}" 2>/dev/null`)
        } else {
          result = await runCommand(
            `gh search repos "${escapeShell(query)}" --limit ${count || 5} 2>/dev/null`
          )
        }
        break
      }

      case "bilibili": {
        if (!query && !url) {
          return NextResponse.json({ error: "B站搜索需要 query 或 url 参数" }, { status: 400 })
        }
        if (url) {
          result = await runCommand(
            `yt-dlp --skip-download --print "Title: %(title)s\\nUploader: %(uploader)s\\nDuration: %(duration_string)s\\nView Count: %(view_count)s\\nDescription: %(description).500s" "${escapeShell(url)}" 2>/dev/null`
          )
        } else {
          // B站搜索 API
          const encodedQuery = encodeURIComponent(query!)
          result = await runCommand(
            `curl -s "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodedQuery}&page=1&page_size=${count || 5}" 2>/dev/null`
          )
        }
        break
      }

      case "rss": {
        if (!url) {
          return NextResponse.json({ error: "RSS 读取需要 url 参数" }, { status: 400 })
        }
        const rssCount = count || 10
        // 使用 Python feedparser 读取 RSS
        const pyScript = `
import feedparser, json
feed = feedparser.parse('${escapeShell(url)}')
items = [{'title': e.get('title',''), 'link': e.get('link',''), 'published': e.get('published',''), 'summary': e.get('summary','')[:200]} for e in feed.entries[:${rssCount}]]
print(json.dumps({'title': feed.feed.get('title',''), 'items': items}, ensure_ascii=False, indent=2))
`.trim()
        result = await runCommand(`python3 -c "${escapeShell(pyScript)}" 2>/dev/null`)
        break
      }

      case "doctor": {
        result = await runCommand("agent-reach doctor --json 2>/dev/null || agent-reach doctor 2>/dev/null")
        break
      }

      default:
        return NextResponse.json({ error: `不支持的 action: ${action}` }, { status: 400 })
    }

    // 截断过长的结果（避免超出 token 限制）
    const maxLen = 15000
    const truncated = result.length > maxLen
    const content = truncated ? result.slice(0, maxLen) + "\n\n[内容过长已截断...]" : result

    return NextResponse.json({
      success: true,
      action,
      content,
      truncated,
      originalLength: result.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json({ error: `Agent Reach 调用失败: ${message}` }, { status: 500 })
  }
}

/** 执行 shell 命令并返回输出 */
async function runCommand(cmd: string): Promise<string> {
  try {
    const home = process.env.HOME || "/Users/fzchun"
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5, // 5MB
      env: {
        ...process.env,
        PATH: `${home}/.local/share/mise/shims:${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
      },
    })
    return stdout || stderr || "(无输出)"
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string }
      return execErr.stdout || execErr.stderr || execErr.message || "命令执行失败"
    }
    throw err
  }
}

/** 转义 shell 特殊字符 */
function escapeShell(str: string): string {
  return str.replace(/(['"\\$`!])/g, "\\$1")
}
