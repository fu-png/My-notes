/**
 * RAG API 路由
 *
 * POST /api/projects/[id]/rag — 执行 RAG 操作
 *   action: "index"  — 索引整个项目（SSE 流式进度）
 *   action: "query"  — 执行 RAG 查询
 *   action: "status" — 获取索引状态
 *   action: "delete" — 删除索引
 */

import { NextRequest, NextResponse } from "next/server"
import { ingestProject, queryProject, getIndexStatus } from "@/lib/rag/pipeline"
import type { RAGConfig } from "@/lib/rag/types"
import { loadChunksData } from "@/lib/rag/vector-store"
import { deletePrefix } from "@/lib/storage"
import { isValidProjectId, invalidProjectIdResponse } from "@/lib/validation"

export const maxDuration = 300 // 索引操作可能较慢

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params

    if (!isValidProjectId(projectId)) {
      return invalidProjectIdResponse()
    }

    const body = await request.json()
    const { action, apiKey, apiBase, model, embeddingModel, embeddingApiKey, embeddingApiBase, rerankModel, question, maxContextTokens, stream, activeFile } = body

    if (!projectId) {
      return NextResponse.json({ error: "缺少项目 ID" }, { status: 400 })
    }

    switch (action) {
      case "status": {
        const status = await getIndexStatus(projectId)
        return NextResponse.json({ status })
      }

      case "index": {
        // embedding 有内置默认 API Key（SiliconFlow + bge-large-zh-v1.5），
        // 不再强制要求用户提供 chat API key 即可构建索引
        const effectiveApiKey = apiKey || embeddingApiKey || "sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua"

        const config: RAGConfig = {
          apiKey: effectiveApiKey,
          apiBase: apiBase || "https://api.openai.com/v1",
          chatModel: model || "gpt-4o-mini",
          embeddingModel: embeddingModel || "BAAI/bge-m3",
          embeddingApiKey: embeddingApiKey || "sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua",
          embeddingApiBase: embeddingApiBase || "https://api.siliconflow.cn/v1/embeddings",
          rerankModel: rerankModel || "BAAI/bge-reranker-v2-m3",
          maxContextTokens: maxContextTokens || 12000,
        }

        // 流式模式：通过 SSE 实时推送进度
        if (stream) {
          const encoder = new TextEncoder()
          const readable = new ReadableStream({
            async start(controller) {
              // SSE 心跳：每 10 秒发送一个 SSE 注释行，防止 Vercel 网关 / CDN
              // 因长时间无数据而断开连接（OSS 上传几 MB 的向量数据可能耗时 30s+）
              const heartbeat = setInterval(() => {
                try {
                  controller.enqueue(encoder.encode(": heartbeat\n\n"))
                } catch {
                  // controller 已关闭，忽略
                }
              }, 10_000)

              try {
                const result = await ingestProject(projectId, config, (msg) => {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ progress: msg })}\n\n`)
                  )
                })
                // 索引完成，发送最终结果
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ done: true, success: true, ...result })}\n\n`
                  )
                )
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "未知错误"
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ done: true, success: false, error: message })}\n\n`
                  )
                )
              } finally {
                clearInterval(heartbeat)
                controller.close()
              }
            },
          })

          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          })
        }

        // 非流式模式（后台自动索引等场景）
        const progressMessages: string[] = []
        const result = await ingestProject(projectId, config, (msg) => {
          progressMessages.push(msg)
        })

        return NextResponse.json({
          success: true,
          ...result,
          progress: progressMessages,
        })
      }

      case "query": {
        if (!question) {
          return NextResponse.json(
            { error: "缺少查询问题" },
            { status: 400 }
          )
        }

        const queryApiKey = apiKey || embeddingApiKey || "sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua"
        const config: RAGConfig = {
          apiKey: queryApiKey,
          apiBase: apiBase || "https://api.openai.com/v1",
          chatModel: model || "gpt-4o-mini",
          embeddingModel: embeddingModel || "BAAI/bge-m3",
          embeddingApiKey: embeddingApiKey || "sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua",
          embeddingApiBase: embeddingApiBase || "https://api.siliconflow.cn/v1/embeddings",
          rerankModel: rerankModel || "BAAI/bge-reranker-v2-m3",
          maxContextTokens: maxContextTokens || 12000,
        }

        const context = await queryProject(projectId, question, config, activeFile)
        return NextResponse.json({ context })
      }

      case "sources": {
        // 返回索引的来源详情：每个文件的分块数和摘要
        const chunks = await loadChunksData(projectId)
        const status = await getIndexStatus(projectId)

        // 按文件分组统计
        const fileMap = new Map<string, { filename: string; fileTitle: string; chunkCount: number; totalTokens: number; headings: string[] }>()
        for (const chunk of chunks) {
          const existing = fileMap.get(chunk.filename)
          if (existing) {
            existing.chunkCount++
            existing.totalTokens += chunk.tokenCount
            for (const h of chunk.headingPath) {
              if (h && !existing.headings.includes(h)) {
                existing.headings.push(h)
              }
            }
          } else {
            fileMap.set(chunk.filename, {
              filename: chunk.filename,
              fileTitle: chunk.fileTitle,
              chunkCount: 1,
              totalTokens: chunk.tokenCount,
              headings: chunk.headingPath.filter(Boolean),
            })
          }
        }

        return NextResponse.json({
          status,
          files: Array.from(fileMap.values()),
          totalChunks: chunks.length,
          totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
        })
      }

      case "delete": {
        await deletePrefix(`projects/${projectId}/.rag/`)
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json(
          { error: `未知操作: ${action}` },
          { status: 400 }
        )
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误"
    console.error("[RAG API] Error:", error)
    return NextResponse.json(
      { error: `RAG 操作失败: ${message}` },
      { status: 500 }
    )
  }
}
