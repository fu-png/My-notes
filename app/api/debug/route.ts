import { NextRequest, NextResponse } from "next/server"
import { listFiles } from "@/lib/storage"

export async function GET(request: NextRequest) {
  // 双重保护：环境变量 + 访问令牌
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Debug endpoint disabled in production" }, { status: 403 })
  }

  // 非生产环境也需要令牌验证（防止未授权访问）
  const debugSecret = process.env.DEBUG_SECRET
  if (!debugSecret) {
    // 未配置 DEBUG_SECRET 时直接拒绝访问
    return NextResponse.json({ error: "DEBUG_SECRET not configured" }, { status: 403 })
  }
  const token = request.headers.get("x-debug-token")
  if (token !== debugSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const info = {
    deployVersion: "v5-oss-migration",
    deployTime: "2026-07-01T00:00:00Z",
    hasOSSKeyId: !!process.env.OSS_ACCESS_KEY_ID,
    hasOSSKeySecret: !!process.env.OSS_ACCESS_KEY_SECRET,
    ossBucket: process.env.OSS_BUCKET || "(not set)",
    ossRegion: process.env.OSS_REGION || "(not set)",
    nodeEnv: process.env.NODE_ENV,
  }

  try {
    const files = await listFiles("projects/")
    return NextResponse.json({
      ...info,
      ossListSuccess: true,
      fileCount: files.length,
      sampleFiles: files.slice(0, 5).map((f) => f.pathname),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      ...info,
      ossListSuccess: false,
      error: message,
    }, { status: 500 })
  }
}
