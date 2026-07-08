import type { FastifyInstance } from "fastify"
import { getAuthContext, requireProject } from "../../lib/auth-context.js"
import { createProject, deletePrefix, getProjects, readFile, writeFile } from "../../lib/storage.js"
import { isValidProjectId } from "../../lib/validation.js"
import { createProjectSchema, updateProjectSchema } from "./projects.schema.js"

/**
 * 项目创建速率限制（每 userId 每分钟最多 10 次）
 * 与原 Next.js 实现一致地按内存 Map 限流；迁移后按 userId（而非 IP）计数，
 * 因为鉴权后 userId 是更可靠的身份标识，且不会受 NAT/代理共享 IP 的误伤。
 * 注意：这是进程内状态，多实例部署时限流不会跨实例共享，可接受但需留意。
 */
const projectRateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkProjectRateLimit(userId: string): boolean {
  const now = Date.now()
  if (projectRateLimitMap.size > 1000) {
    for (const [key, val] of projectRateLimitMap) {
      if (now > val.resetAt) projectRateLimitMap.delete(key)
    }
  }
  const entry = projectRateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    projectRateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= 10
}

export default async function projectsRoutes(fastify: FastifyInstance) {
  // GET /projects — list all projects owned by the current user
  fastify.get("/projects", { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      const { userId } = getAuthContext(request)
      const projects = await getProjects(userId)
      return { projects }
    } catch (err) {
      fastify.log.error(err, "GET /projects error")
      return reply.code(500).send({ projects: [], error: "获取项目列表失败" })
    }
  })

  // POST /projects — create a new project
  fastify.post("/projects", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { userId } = getAuthContext(request)

    if (!checkProjectRateLimit(userId)) {
      return reply.code(429).send({ error: "请求过于频繁，请稍后重试" })
    }

    const parsed = createProjectSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
    }

    try {
      const project = await createProject(userId, parsed.data.name)
      return { success: true, project }
    } catch (err) {
      fastify.log.error(err, "POST /projects error")
      const message = err instanceof Error ? err.message : String(err)
      const isConfigError = message.includes("OSS") || message.includes("只读")
      return reply.code(isConfigError ? 503 : 500).send({ error: message })
    }
  })

  // GET /projects/:id — get project detail with file list
  fastify.get<{ Params: { id: string } }>(
    "/projects/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      try {
        const result = await requireProject(request, reply, id)
        if (!result) return // requireProject 已写入 404 响应

        return { project: result.meta, files: result.files, firstFileContent: result.firstFileContent }
      } catch (err) {
        fastify.log.error(err, "GET /projects/:id error")
        return reply.code(500).send({ error: "读取项目失败" })
      }
    }
  )

  // PATCH /projects/:id — update project metadata (e.g. rename)
  fastify.patch<{ Params: { id: string } }>(
    "/projects/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      const parsed = updateProjectSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "参数校验失败" })
      }

      try {
        const { userId } = getAuthContext(request)
        // 先确认项目归属当前用户，再读写 meta.json，避免越权改名
        const existing = await requireProject(request, reply, id)
        if (!existing) return

        const metaPath = `users/${userId}/projects/${id}/meta.json`
        const raw = await readFile(metaPath)
        if (!raw) {
          return reply.code(404).send({ error: "项目不存在" })
        }

        const meta = JSON.parse(raw)
        meta.name = parsed.data.name

        await writeFile(metaPath, JSON.stringify(meta, null, 2), {
          contentType: "application/json",
        })

        return { success: true, project: meta }
      } catch (err) {
        fastify.log.error(err, "PATCH /projects/:id error")
        return reply.code(500).send({ error: "更新项目失败" })
      }
    }
  )

  // DELETE /projects/:id — delete entire project
  fastify.delete<{ Params: { id: string } }>(
    "/projects/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = request.params
      if (!isValidProjectId(id)) {
        return reply.code(400).send({ error: "无效的项目 ID" })
      }

      try {
        const { userId } = getAuthContext(request)
        // 复用 requireProject 校验归属，避免删除到别的用户的同名 ID 项目
        const existing = await requireProject(request, reply, id)
        if (!existing) return

        const success = await deletePrefix(`users/${userId}/projects/${id}/`)
        if (!success) {
          return reply.code(404).send({ error: "项目不存在" })
        }
        return { success: true }
      } catch (err) {
        fastify.log.error(err, "DELETE /projects/:id error")
        return reply.code(500).send({ error: "删除项目失败" })
      }
    }
  )
}
