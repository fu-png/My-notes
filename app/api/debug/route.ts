import { NextResponse } from "next/server"
import { listFiles } from "@/lib/storage"

export async function GET() {
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
