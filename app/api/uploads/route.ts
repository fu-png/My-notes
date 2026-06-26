import { NextResponse } from "next/server"
import { listFiles } from "@/lib/storage"

export async function GET() {
  try {
    const allFiles = await listFiles("uploads/")
    const files = allFiles
      .filter((f) => f.pathname.endsWith(".md"))
      .map((f) => {
        const filename = f.pathname.split("/").pop() ?? ""
        return {
          filename,
          title: filename.replace(/\.md$/, ""),
        }
      })

    return NextResponse.json({ files })
  } catch {
    return NextResponse.json({ files: [] })
  }
}
