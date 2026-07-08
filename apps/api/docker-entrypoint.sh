#!/bin/sh
set -e

# 生产环境启动前先执行未应用的迁移（migrate deploy 不会像 migrate dev 那样
# 交互式生成新迁移，只回放已有的 migration.sql，安全用于生产/CI）
echo "[entrypoint] Applying pending Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting API server..."
exec node dist/index.js
