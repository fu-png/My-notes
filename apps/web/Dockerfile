# syntax=docker/dockerfile:1

# ------------------------------------------------------------------
# Stage 1: 安装依赖
# ------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --filter web --frozen-lockfile

# ------------------------------------------------------------------
# Stage 2: 构建 Next.js
# ------------------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web apps/web

WORKDIR /repo/apps/web

# 构建时需要的环境变量（后端地址在运行时通过 Docker 内部网络通信）
ARG API_BASE_URL=http://api:4000
ENV API_BASE_URL=${API_BASE_URL}
# 限制 Node.js 内存，避免小内存服务器 OOM
ENV NODE_OPTIONS="--max-old-space-size=1024"

RUN pnpm build 2>&1 || (echo "=== BUILD FAILED ===" && cat .next/build-error.log 2>/dev/null; exit 1)

# ------------------------------------------------------------------
# Stage 3: 精简运行时镜像
# ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Next.js standalone 模式输出（next build 自动产生）
# 如果 standalone 不可用，回退到完整安装
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
