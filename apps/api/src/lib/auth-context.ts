/**
 * 鉴权上下文辅助函数
 *
 * 设计说明：数据隔离的第一道防线是 storage.ts 里所有项目相关操作都强制要求
 * userId 参数并据此拼接存储路径前缀——只要路由 handler 统一从这里获取 userId
 * （而不是信任 body/query 里的任意字段），跨用户越权访问天然不可能发生：
 * 请求方无法构造出别人命名空间下的路径。
 *
 * 这一层的职责仅仅是：
 * 1. 提供统一、类型安全的方式从已认证请求中取出 userId / organizationId，
 *    避免各路由散落地手写 `request.user.sub`。
 * 2. 提供 `requireProject` 封装：按当前用户身份查找项目，不存在时统一返回
 *    404（而非 403），避免向调用方泄露"项目 ID 存在但属于别人"这类信息。
 */

import type { FastifyReply, FastifyRequest } from "fastify"
import { getProject, type ProjectMeta } from "./storage.js"

export interface AuthContext {
  userId: string
  organizationId: string
}

/**
 * 从已通过 fastify.authenticate 校验的请求中提取鉴权上下文。
 * 调用方必须确保路由已配置 `preHandler: fastify.authenticate`，
 * 否则 request.user 不存在，这里会抛出异常而不是静默返回无效数据。
 */
export function getAuthContext(request: FastifyRequest): AuthContext {
  const user = request.user
  if (!user?.sub) {
    throw new Error(
      "[auth-context] request.user 不存在，请确认路由已配置 preHandler: fastify.authenticate"
    )
  }
  return { userId: user.sub, organizationId: user.organizationId }
}

/**
 * 按当前用户身份查找项目详情；不存在或不属于当前用户时，
 * 统一写入 404 响应并返回 null，调用方直接 `return` 即可短路后续逻辑。
 *
 * 用法：
 * ```ts
 * const project = await requireProject(request, reply, request.params.id)
 * if (!project) return
 * ```
 */
export async function requireProject(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string
): Promise<
  | (Awaited<ReturnType<typeof getProject>> & { meta: ProjectMeta })
  | null
> {
  const { userId } = getAuthContext(request)
  const project = await getProject(userId, projectId)
  if (!project) {
    reply.code(404).send({ error: "项目不存在" })
    return null
  }
  return project
}
