/**
 * 调试信息 API — 对应原 Next.js 的 app/api/debug/route.ts
 *
 * 双重保护：非 production 环境 + x-debug-token 请求头匹配 DEBUG_SECRET 环境变量。
 * 迁移说明：逻辑纯平移，不接入 JWT 鉴权（与原实现一致，仅依赖环境变量+密钥头）。
 */

import type { FastifyInstance } from "fastify"
import { listFiles } from "../../lib/storage.js"

export default async function debugRoutes(fastify: FastifyInstance) {
  fastify.get("/debug", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.code(403).send({ error: "Debug endpoint disabled in production" })
    }

    const debugSecret = process.env.DEBUG_SECRET
    if (!debugSecret) {
      return reply.code(403).send({ error: "DEBUG_SECRET not configured" })
    }

    const token = request.headers["x-debug-token"]
    if (token !== debugSecret) {
      return reply.code(401).send({ error: "Unauthorized" })
    }

    const info = {
      deployVersion: "v6-fastify-migration",
      deployTime: new Date().toISOString(),
      hasOSSKeyId: !!process.env.OSS_ACCESS_KEY_ID,
      hasOSSKeySecret: !!process.env.OSS_ACCESS_KEY_SECRET,
      ossBucket: process.env.OSS_BUCKET || "(not set)",
      ossRegion: process.env.OSS_REGION || "(not set)",
      nodeEnv: process.env.NODE_ENV,
    }

    try {
      const files = await listFiles("users/")
      return {
        ...info,
        ossListSuccess: true,
        fileCount: files.length,
        sampleFiles: files.slice(0, 5).map((f) => f.pathname),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return reply.code(500).send({
        ...info,
        ossListSuccess: false,
        error: message,
      })
    }
  })
}
