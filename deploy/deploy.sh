#!/bin/bash
# ============================================================
# MyNotes 一键部署 / 更新脚本
#
# 使用方式:
#   bash deploy/deploy.sh          # 首次部署或更新
#   bash deploy/deploy.sh --seed   # 首次部署（含种子数据初始化）
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"

echo "========================================="
echo "  MyNotes 部署"
echo "========================================="
echo "  项目目录: $PROJECT_DIR"
echo "  配置文件: $ENV_FILE"
echo ""

# ------ 1. 检查 .env.production ------
if [ ! -f "$ENV_FILE" ]; then
    echo "[错误] 未找到 .env.production 文件"
    echo ""
    echo "请先创建配置文件:"
    echo "  cp .env.production.example .env.production"
    echo "  vim .env.production   # 填入数据库密码和 JWT 密钥"
    echo ""

    read -p "是否自动生成一份配置？(y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PG_PASSWORD=$(openssl rand -base64 16 | tr -d '=/+')
        JWT_ACCESS=$(openssl rand -base64 32)
        JWT_REFRESH=$(openssl rand -base64 32)

        cat > "$ENV_FILE" <<EOF
# MyNotes 生产环境配置（自动生成于 $(date '+%Y-%m-%d %H:%M:%S')）

POSTGRES_USER=mynotes
POSTGRES_PASSWORD=$PG_PASSWORD
POSTGRES_DB=mynotes_prod

JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_REFRESH_SECRET=$JWT_REFRESH

# 设为你的前端域名，如 https://my-notes.vercel.app
CORS_ORIGIN=*

HTTP_PORT=80
EOF
        echo "  ✓ 已生成 .env.production（密钥已自动生成）"
        echo "  ⚠ 请稍后编辑 CORS_ORIGIN 为你的前端域名"
        echo ""
    else
        exit 1
    fi
fi

# ------ 2. 验证必填项 ------
source "$ENV_FILE"
MISSING=""
[ -z "${POSTGRES_PASSWORD:-}" ] && MISSING="$MISSING POSTGRES_PASSWORD"
[ -z "${JWT_ACCESS_SECRET:-}" ] && MISSING="$MISSING JWT_ACCESS_SECRET"
[ -z "${JWT_REFRESH_SECRET:-}" ] && MISSING="$MISSING JWT_REFRESH_SECRET"

if [ -n "$MISSING" ]; then
    echo "[错误] 以下环境变量未设置:$MISSING"
    echo "请编辑 .env.production 补充"
    exit 1
fi

echo "[1/4] ✓ 配置文件检查通过"

# ------ 3. 构建并启动 ------
echo "[2/5] 构建镜像并启动服务（首次构建可能需要 3-8 分钟）..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build --remove-orphans

echo "[3/5] 等待服务就绪..."
sleep 8

# 检查容器状态
PG_STATUS=$(docker inspect --format='{{.State.Status}}' mynotes-postgres 2>/dev/null || echo "not found")
API_STATUS=$(docker inspect --format='{{.State.Status}}' mynotes-api 2>/dev/null || echo "not found")
WEB_STATUS=$(docker inspect --format='{{.State.Status}}' mynotes-web 2>/dev/null || echo "not found")
NGINX_STATUS=$(docker inspect --format='{{.State.Status}}' mynotes-nginx 2>/dev/null || echo "not found")

echo "  PostgreSQL: $PG_STATUS"
echo "  API:        $API_STATUS"
echo "  Web:        $WEB_STATUS"
echo "  Nginx:      $NGINX_STATUS"

FAILED=""
[ "$API_STATUS" != "running" ] && FAILED="$FAILED api"
[ "$WEB_STATUS" != "running" ] && FAILED="$FAILED web"
if [ -n "$FAILED" ]; then
    echo ""
    echo "[错误] 以下容器未正常运行:$FAILED"
    [ "$API_STATUS" != "running" ] && echo "--- mynotes-api 日志 ---" && docker logs mynotes-api --tail 20
    [ "$WEB_STATUS" != "running" ] && echo "--- mynotes-web 日志 ---" && docker logs mynotes-web --tail 20
    exit 1
fi

echo ""
echo "[4/5] 验证服务可达..."
if curl -sf http://localhost/health > /dev/null 2>&1; then
    echo "  ✓ http://localhost/health 返回正常"
else
    echo "  ⚠ 健康检查暂未通过（服务可能仍在启动中，请稍后重试）"
fi

# ------ 5. 种子数据（可选） ------
if [[ "${1:-}" == "--seed" ]]; then
    echo "[5/5] 初始化种子数据..."
    docker exec mynotes-api node -e "
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const plans = [
        { code: 'free', name: '免费版', priceInCents: 0, billingPeriod: 'month', features: { maxProjects: 5, monthlyTokenQuota: 50000, monthlyStorageQuotaMB: 100, deepResearch: true, pptGeneration: false, audioGeneration: false, prioritySupport: false, teamCollaboration: false } },
        { code: 'pro', name: 'Pro 专业版', priceInCents: 2900, billingPeriod: 'month', features: { maxProjects: -1, monthlyTokenQuota: 500000, monthlyStorageQuotaMB: 5120, deepResearch: true, pptGeneration: true, audioGeneration: true, prioritySupport: true, teamCollaboration: false } },
        { code: 'team', name: 'Team 团队版', priceInCents: 9900, billingPeriod: 'month', features: { maxProjects: -1, monthlyTokenQuota: 2000000, monthlyStorageQuotaMB: 51200, deepResearch: true, pptGeneration: true, audioGeneration: true, prioritySupport: true, teamCollaboration: true } },
      ];
      (async () => {
        for (const p of plans) {
          await prisma.plan.upsert({ where: { code: p.code }, update: { name: p.name, priceInCents: p.priceInCents, billingPeriod: p.billingPeriod, features: p.features }, create: p });
          console.log('  ✓ ' + p.code + ': ' + p.name);
        }
        await prisma.\$disconnect();
        console.log('种子数据初始化完成！');
      })();
    "
else
    echo "[5/5] 跳过种子数据（首次部署请加 --seed 参数）"
fi

# ------ 完成 ------
SERVER_IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "========================================="
echo "  ✅ 部署完成！"
echo "========================================="
echo ""
echo "  网站地址:  http://$SERVER_IP"
echo "  健康检查:  http://$SERVER_IP/health"
echo ""
echo "  查看日志:"
echo "    docker logs -f mynotes-api     # 后端日志"
echo "    docker logs -f mynotes-web     # 前端日志"
echo "    docker logs -f mynotes-nginx   # Nginx 日志"
echo ""
echo "  停止服务:  docker compose -f docker-compose.prod.yml --env-file .env.production down"
echo "  更新部署:  git pull && bash deploy/deploy.sh"
echo ""
