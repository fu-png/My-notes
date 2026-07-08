import { NextRequest } from 'next/server'
import { getJob, subscribe } from '@/lib/deep-research/job-store'
import type { SSEEvent } from '@/lib/deep-research/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return new Response(JSON.stringify({ error: '缺少 jobId 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const job = getJob(jobId)
  if (!job) {
    return new Response(JSON.stringify({ error: '任务不存在或已过期' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: SSEEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`
        try {
          controller.enqueue(encoder.encode(data))
        } catch {}
      }

      // 先发送已有的事件（重连/延迟订阅场景）
      for (const event of job.events) {
        sendEvent(event)
      }

      // 如果任务已经结束，直接关闭
      if (job.status === 'completed' || job.status === 'error') {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }

      // 订阅后续事件
      const unsubscribe = subscribe(jobId, (event) => {
        sendEvent(event)
        if (event.type === 'complete' || event.type === 'error') {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          unsubscribe()
        }
      })

      // 客户端断开连接时清理
      request.signal.addEventListener('abort', () => {
        unsubscribe()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
