/**
 * 内存任务存储 — 管理后台运行的 Deep Research 任务
 *
 * API route 创建任务后立即返回，后台异步执行 graph.stream()
 * 客户端通过 SSE 端点订阅进度更新
 */

import type { SSEEvent } from './types'

export interface ResearchJob {
  id: string
  projectId: string
  query: string
  status: 'running' | 'completed' | 'error'
  events: SSEEvent[]
  /** 所有已连接的 SSE 客户端的控制器列表 */
  subscribers: Set<(event: SSEEvent) => void>
  createdAt: number
  error?: string
}

// 全局任务表（进程内）
const jobs = new Map<string, ResearchJob>()

export function createJob(id: string, projectId: string, query: string): ResearchJob {
  const job: ResearchJob = {
    id,
    projectId,
    query,
    status: 'running',
    events: [],
    subscribers: new Set(),
    createdAt: Date.now(),
  }
  jobs.set(id, job)
  return job
}

export function getJob(id: string): ResearchJob | undefined {
  return jobs.get(id)
}

export function getJobByProjectId(projectId: string): ResearchJob | undefined {
  for (const job of jobs.values()) {
    if (job.projectId === projectId) return job
  }
  return undefined
}

/** 向任务推送一个事件，通知所有订阅者 */
export function pushEvent(jobId: string, event: SSEEvent) {
  const job = jobs.get(jobId)
  if (!job) return
  job.events.push(event)
  for (const cb of job.subscribers) {
    try { cb(event) } catch {}
  }
}

/** 标记任务完成 */
export function completeJob(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return
  job.status = 'completed'
  for (const cb of job.subscribers) {
    try { cb({ type: 'complete', projectId: job.projectId, fileCount: 0, message: '研究完成' }) } catch {}
  }
}

/** 标记任务出错 */
export function errorJob(jobId: string, error: string) {
  const job = jobs.get(jobId)
  if (!job) return
  job.status = 'error'
  job.error = error
  for (const cb of job.subscribers) {
    try { cb({ type: 'error', message: '研究过程中出错', detail: error }) } catch {}
  }
}

/** 订阅任务更新，返回取消订阅函数 */
export function subscribe(jobId: string, cb: (event: SSEEvent) => void): () => void {
  const job = jobs.get(jobId)
  if (!job) return () => {}
  job.subscribers.add(cb)
  return () => {
    job.subscribers.delete(cb)
  }
}

/** 清理超过 30 分钟的已完成任务 */
export function cleanupOldJobs() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.createdAt > 30 * 60 * 1000) {
      jobs.delete(id)
    }
  }
}
