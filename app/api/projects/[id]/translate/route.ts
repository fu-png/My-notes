import { NextRequest, NextResponse } from "next/server"
import { translate } from "bing-translate-api"
import { readFile, writeFile } from "fs/promises"
import path from "path"

const CONTENT_DIR = path.join(process.cwd(), "content", "projects")

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const { filename } = await request.json()

    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 })
    }

    // Read the file content
    const filePath = path.join(CONTENT_DIR, projectId, filename)
    const content = await readFile(filePath, "utf-8")

    if (!content.trim()) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 })
    }

    // Split content into chunks to handle Bing's length limits
    // Bing translate has a ~1000 char limit per request
    const chunks = splitMarkdownIntoChunks(content, 800)

    // Translate each chunk
    const translatedChunks: string[] = []
    for (const chunk of chunks) {
      if (!chunk.trim()) {
        translatedChunks.push(chunk)
        continue
      }

      try {
        const result = await translate(chunk, null, "zh-Hans")
        translatedChunks.push(result?.translation || chunk)
      } catch {
        // If translation fails for a chunk, keep the original
        translatedChunks.push(chunk)
      }
    }

    const translatedContent = translatedChunks.join("\n\n")

    // Save translated content back to the file
    await writeFile(filePath, translatedContent, "utf-8")

    return NextResponse.json({
      success: true,
      content: translatedContent,
    })
  } catch (error) {
    console.error("Translation error:", error)
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    )
  }
}

/**
 * Split markdown content into chunks that respect paragraph boundaries
 */
function splitMarkdownIntoChunks(text: string, maxLen: number): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxLen && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + "\n\n" + para : para
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}
