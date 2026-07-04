import { NextRequest, NextResponse } from "next/server"
import { getProjects, createProject } from "@/lib/storage"

// 禁止缓存，确保每次请求都读取最新数据
export const dynamic = "force-dynamic"

// GET /api/projects — list all projects
export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json({ projects })
  } catch (err) {
    console.error("GET /api/projects error:", err)
    return NextResponse.json({ projects: [], error: "获取项目列表失败" }, { status: 500 })
  }
}

// 项目创建速率限制（每 IP 每分钟最多 10 次）
const projectRateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkProjectRateLimit(ip: string): boolean {
  const now = Date.now()
  // 定期清理过期条目
  if (projectRateLimitMap.size > 100) {
    for (const [key, val] of projectRateLimitMap) {
      if (now > val.resetAt) projectRateLimitMap.delete(key)
    }
  }
  const entry = projectRateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    projectRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= 10
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  try {
    // 速率限制
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (!checkProjectRateLimit(clientIp)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 })
    }

    const body = await request.json()
    const name = (body.name || "").trim()

    if (!name) {
      return NextResponse.json({ error: "项目名称不能为空" }, { status: 400 })
    }

    // 名称长度和字符校验
    if (name.length > 100) {
      return NextResponse.json({ error: "项目名称不能超过 100 个字符" }, { status: 400 })
    }
    if (/[\\/:*?"<>|]/.test(name)) {
      return NextResponse.json({ error: "项目名称不能包含特殊字符" }, { status: 400 })
    }

    const project = await createProject(name)
    return NextResponse.json({ success: true, project })
  } catch (err) {
    console.error("POST /api/projects error:", err)
    const message = err instanceof Error ? err.message : String(err)
    // 如果是 Blob 未配置的错误，返回 503 让前端可以区分
    const isConfigError = message.includes("Blob") || message.includes("只读")
    return NextResponse.json(
      { error: message },
      { status: isConfigError ? 503 : 500 }
    )
  }
}
