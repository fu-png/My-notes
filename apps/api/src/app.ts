import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import sensible from "@fastify/sensible"
import Fastify from "fastify"
import { loadEnv } from "./config/env.js"
import jwtPlugin from "./plugins/jwt.js"
import prismaPlugin from "./plugins/prisma.js"
import authRoutes from "./modules/auth/auth.routes.js"
import agentReachRoutes from "./modules/agent-reach/agent-reach.routes.js"
import chatRoutes from "./modules/chat/chat.routes.js"
import debugRoutes from "./modules/debug/debug.routes.js"
import healthRoutes from "./modules/health/health.routes.js"
import audioRoutes from "./modules/projects/audio.routes.js"
import chatHistoryRoutes from "./modules/projects/chat-history.routes.js"
import downloadRoutes from "./modules/projects/download.routes.js"
import filesRoutes from "./modules/projects/files.routes.js"
import generateRoutes from "./modules/projects/generate.routes.js"
import generatePptOutlineRoutes from "./modules/projects/generate-ppt-outline.routes.js"
import generateSlideImageRoutes from "./modules/projects/generate-slide-image.routes.js"
import importUrlRoutes from "./modules/projects/import-url.routes.js"
import projectsRoutes from "./modules/projects/projects.routes.js"
import ragRoutes from "./modules/projects/rag.routes.js"
import translateRoutes from "./modules/projects/translate.routes.js"
import deepResearchRoutes from "./modules/deep-research/deep-research.routes.js"
import searchRoutes from "./modules/search/search.routes.js"
import uploadsRoutes from "./modules/uploads/uploads.routes.js"
import billingRoutes from "./modules/billing/billing.routes.js"
import usageRoutes from "./modules/usage/usage.routes.js"

/**
 * 构建 Fastify 实例（不监听端口），方便单元测试直接 inject 请求
 */
export async function buildApp() {
  const env = loadEnv()

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  })

  await app.register(sensible)
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  })

  await app.register(prismaPlugin)
  await app.register(jwtPlugin)
  await app.register(multipart, {
    limits: {
      // 与原 /api/upload 路由的 10MB 限制保持一致；files 通配路由（后续批次迁移）
      // 若需要支持更大的音频/文档文件，可在具体路由级别用 request.file({ limits }) 覆盖
      fileSize: 10 * 1024 * 1024,
    },
  })

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(projectsRoutes)
  await app.register(chatHistoryRoutes)
  await app.register(translateRoutes)
  await app.register(importUrlRoutes)
  await app.register(uploadsRoutes)
  await app.register(filesRoutes)
  await app.register(downloadRoutes)
  await app.register(generateSlideImageRoutes)
  await app.register(agentReachRoutes)
  await app.register(debugRoutes)
  await app.register(chatRoutes)
  await app.register(generateRoutes)
  await app.register(generatePptOutlineRoutes)
  await app.register(audioRoutes)
  await app.register(ragRoutes)
  await app.register(deepResearchRoutes)
  await app.register(searchRoutes)
  await app.register(billingRoutes)
  await app.register(usageRoutes)

  return app
}
