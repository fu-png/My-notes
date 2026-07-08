# MyNotes 部署指南

## 架构概览

前后端全部部署在同一台阿里云 ECS 上，通过 Docker Compose 编排四个容器：

```
用户浏览器
    │
    │  :80
┌───┴────────────────────────────────────────┐
│                  Nginx                     │
│  /api/auth/*  → Next.js (cookie 管理)      │
│  /api/*       → Next.js (token 代理)       │
│  /_next/*     → Next.js (静态资源,长缓存)   │
│  /*           → Next.js (页面)             │
└───┬──────────────────┬─────────────────────┘
    │                  │
┌───┴───┐          ┌───┴───┐
│  Web  │  :3000   │  API  │  :4000
│Next.js│──────────│Fastify│
└───────┘ 内部网络  └───┬───┘
                        │
                    ┌───┴───┐
                    │  PG   │  :5432
                    │ 16-alp│
                    └───────┘
```

所有端口只在 Docker 内部网络中通信，只有 Nginx 的 80 端口暴露到外网。

## 快速开始

### 第一步：初始化服务器

```bash
ssh root@你的服务器IP

git clone <你的仓库地址> /opt/mynotes
cd /opt/mynotes

# 安装 Docker（支持 Ubuntu/Debian/CentOS/Alinux）
sudo bash deploy/setup-server.sh
```

### 第二步：一键部署

```bash
cd /opt/mynotes
bash deploy/deploy.sh --seed
```

这一条命令会完成所有事情：

1. 自动生成 `.env.production`（含随机数据库密码和 JWT 密钥）
2. 构建前端和后端 Docker 镜像（首次约 3-8 分钟）
3. 启动 PostgreSQL → API → Web → Nginx 四个容器
4. 自动运行数据库迁移
5. 初始化套餐种子数据

完成后访问 `http://你的服务器IP` 即可看到网站。

## 常用运维命令

```bash
# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker logs -f mynotes-api       # 后端
docker logs -f mynotes-web       # 前端
docker logs -f mynotes-nginx     # Nginx

# 更新部署
git pull && bash deploy/deploy.sh

# 停止所有服务
docker compose -f docker-compose.prod.yml --env-file .env.production down

# 备份数据库
docker exec mynotes-postgres pg_dump -U mynotes mynotes_prod > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup.sql | docker exec -i mynotes-postgres psql -U mynotes mynotes_prod

# 进入 API 容器调试
docker exec -it mynotes-api sh
```

## 安全组配置

在阿里云控制台 → ECS → 安全组，放行以下端口：

| 端口 | 协议 | 用途 |
|------|------|------|
| 80   | TCP  | HTTP |
| 443  | TCP  | HTTPS（配域名后使用） |
| 22   | TCP  | SSH（建议限制来源 IP） |

不要暴露 3000、4000、5432 端口。

## 配置域名 + HTTPS

有域名后，推荐用 Caddy 替代 Nginx（自动申请和续期 HTTPS 证书）。

修改 `docker-compose.prod.yml` 中的 nginx 服务：

```yaml
caddy:
  image: caddy:2-alpine
  container_name: mynotes-caddy
  restart: always
  depends_on:
    - api
    - web
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
```

创建 `deploy/Caddyfile`：

```
yourdomain.com {
    # 前端
    reverse_proxy /* web:3000

    # Next.js 静态资源长缓存
    @static path /_next/static/*
    header @static Cache-Control "public, max-age=31536000, immutable"
}
```

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `POSTGRES_PASSWORD` | 是 | 数据库密码 |
| `JWT_ACCESS_SECRET` | 是 | JWT 签名密钥（≥16 字符） |
| `JWT_REFRESH_SECRET` | 是 | JWT 刷新密钥（≥16 字符） |
| `POSTGRES_USER` | 否 | 数据库用户（默认 mynotes） |
| `POSTGRES_DB` | 否 | 数据库名（默认 mynotes_prod） |
| `CORS_ORIGIN` | 否 | CORS 源（默认 http://localhost） |
| `HTTP_PORT` | 否 | Nginx 端口（默认 80） |

## 文件说明

```
deploy/
├── README.md           ← 本文档
├── nginx.conf          ← Nginx 统一入口配置
├── setup-server.sh     ← 服务器初始化脚本
└── deploy.sh           ← 一键部署/更新脚本

docker-compose.prod.yml ← 四容器编排（PG + API + Web + Nginx）
.env.production.example ← 环境变量模板

apps/api/Dockerfile     ← 后端镜像（Fastify + Prisma）
apps/web/Dockerfile     ← 前端镜像（Next.js standalone）
```
