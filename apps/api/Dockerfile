# syntax=docker/dockerfile:1

# ------------------------------------------------------------------
# Stage 1: 安装依赖（利用 pnpm workspace + lockfile 做分层缓存）
# ------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

# 只拷贝 workspace 元信息和 api 自身的 package.json，最大化利用 Docker 层缓存
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter api --frozen-lockfile

# ------------------------------------------------------------------
# Stage 2: 编译 TypeScript + 生成 Prisma Client
# ------------------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api apps/api

WORKDIR /repo/apps/api
RUN pnpm prisma:generate
RUN pnpm build

# ------------------------------------------------------------------
# Stage 3: 精简运行时镜像，只保留生产依赖和编译产物
# ------------------------------------------------------------------
FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /repo

ENV NODE_ENV=production

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

# 直接复用 build 阶段的完整 node_modules（含 prisma CLI + query engine），
# 避免版本不匹配和生产环境联网下载的问题
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

WORKDIR /repo/apps/api
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
