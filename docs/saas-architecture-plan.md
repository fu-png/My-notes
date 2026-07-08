# MyNotes SaaS 化改造技术方案

> 目标：将当前 Next.js 全栈一体项目，改造为前后端分离的 SaaS 产品，具备用户账号体系、会员订阅、按量计费（Token 计量）、会员数据统计能力。
>
> 决策前提（已与产品方确认）：
> - 收入模式：平台统一提供 AI 能力，按用量/额度计费（用户不再自带 API Key 作为主路径）
> - 客户形态：现阶段个人为主，数据模型预留团队/组织扩展空间
> - 后端技术栈：Node.js + Fastify
> - 数据库：PostgreSQL
> - 交付方式：分阶段落地

---

## 一、现状回顾（作为改造基线）

当前项目是 Next.js 16 单体应用，`app/api/*` 下的路由实际承担了后端职责，但存在以下与 SaaS 化目标冲突的问题：

1. 无用户体系：`app/login`、`app/api/login` 均为空目录，仅占位未实现
2. 无数据隔离：`lib/storage.ts` 中项目路径为全局扁平的 `projects/{projectId}/`，任何请求都能读取全部数据
3. 无计费与用量记录：所有 LLM/Embedding/TTS/图片生成的 API Key 由用户在浏览器 `localStorage` 中自行配置（见 `lib/ai-config.ts`），团队不产生也不追踪调用成本
4. 无数据库：元数据全部以 JSON 文件形式存放于 OSS/本地磁盘（`meta.json`），不具备事务、索引、聚合统计能力
5. 安全隐患：`lib/ai-config.ts` 中 `DEFAULT_EMBEDDING_API_KEY` 为硬编码真实密钥，会被打包进前端产物，任何访客可见并盗用，需要在改造中收敛掉

这些问题决定了本次改造不是"加个登录页"就能解决的，而是需要新增服务端能力层（账号、计费、计量、网关）并重构存储结构。

---

## 二、目标架构总览

### 2.1 服务拆分

```
┌─────────────────────────┐        ┌──────────────────────────────────┐
│   前端 Web App (Next.js) │  HTTPS │        后端 API 服务 (Fastify)     │
│   纯展示 + 客户端状态     │───────▶│                                    │
│   不再包含任何 API 路由   │  JWT   │  ┌──────────────────────────────┐ │
└─────────────────────────┘        │  │ 网关层 Gateway Module         │ │
                                    │  │ - 鉴权 / 限流 / 用量拦截        │ │
                                    │  └──────────────┬───────────────┘ │
                                    │                 │                  │
                                    │  ┌──────────────▼───────────────┐ │
                                    │  │ 业务模块（沿用现有 lib/ 逻辑）  │ │
                                    │  │ - Deep Research Graph         │ │
                                    │  │ - RAG Pipeline                │ │
                                    │  │ - PPT / Podcast / TTS 生成     │ │
                                    │  └──────────────┬───────────────┘ │
                                    │                 │                  │
                                    │  ┌──────────────▼───────────────┐ │
                                    │  │ AI 模型代理 Model Proxy        │ │
                                    │  │ - 统一持有平台自有 API Key      │ │
                                    │  │ - 记录 token 用量流水          │ │
                                    │  └────────────────────────────────┘│
                                    └──────────────┬─────────────────────┘
                                                    │
                        ┌───────────────────────────┼───────────────────────────┐
                        ▼                           ▼                           ▼
                ┌───────────────┐         ┌──────────────────┐        ┌──────────────────┐
                │  PostgreSQL   │         │  对象存储 OSS       │        │  Redis            │
                │  用户/会员/    │         │  项目文件/RAG索引   │        │  限流/会话/队列     │
                │  订单/用量表   │         │                    │        │                    │
                └───────────────┘         └──────────────────┘        └──────────────────┘
```

前端不再持有任何 API Key 或调用第三方大模型，所有 AI 能力请求统一经过后端网关。这是从"工具"转向"SaaS"最核心的一步——只有 AI 调用被收拢到后端，用量计费才有数据来源，商业模式画布里"收入来源"这一格才能真正跑起来。

### 2.2 技术栈选型

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Next.js（仅前端渲染，`output: export` 或纯 CSR，不再写 `app/api`） | 现有组件几乎全是 `"use client"`，迁移成本低 |
| 后端框架 | Fastify + TypeScript | 轻量、性能好、插件生态适合网关类中间件（限流、鉴权） |
| 数据库 | PostgreSQL | 计费类数据需要事务与精确数值类型，团队版需要关系建模 |
| ORM | Prisma | 与现有 TS 技术栈契合，migration 管理直观 |
| 鉴权 | JWT（access token + refresh token） | 前后端分离标配，配合 `jose`（现有依赖已包含）实现 |
| 缓存/限流/队列 | Redis | 承担用量计数、令牌桶限流、异步任务队列（Deep Research 长任务） |
| 对象存储 | 阿里云 OSS（沿用现有） | 项目文件、RAG 索引继续存 OSS，仅路径结构调整为按用户隔离 |
| 支付 | 待定（国内建议接入支付宝当面付/微信支付 SDK，或 Stripe 面向海外） | 见第五章 |

### 2.3 目录结构建议（Monorepo）

```
/apps
  /web          # 现有 Next.js 项目瘦身后迁入，仅保留 app/(marketing)、app/dashboard 等前端页面
  /api          # 新建 Fastify 后端服务
    /src
      /modules
        /auth         # 注册/登录/token 刷新
        /users        # 用户资料
        /billing      # 订阅/订单/权益
        /usage        # 用量计量与统计
        /projects     # 项目 CRUD（迁移自 app/api/projects）
        /ai-gateway   # 模型代理层，统一转发 + 计量
        /deep-research # 迁移自 lib/deep-research
        /rag          # 迁移自 lib/rag
      /db
        schema.prisma
      /plugins        # fastify 插件：jwt、rate-limit、cors
/packages
  /shared-types   # 前后端共享的 TS 类型定义（项目、用户、会员等）
```

采用 pnpm workspace（项目已在用 pnpm）管理 monorepo，`packages/shared-types` 解决前后端分离后最容易出现的类型不同步问题。

---

## 三、数据模型设计

### 3.1 核心实体关系

```
User ──1:N── Project ──1:N── ProjectFile
  │
  ├──1:1── Subscription ──N:1── Plan
  │
  ├──1:N── UsageRecord
  │
  ├──1:N── Order
  │
  └──N:1── Organization（预留，个人用户可为 null）
```

### 3.2 Prisma Schema 草案

```prisma
// ── 用户与组织（预留团队扩展）──

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  name          String?
  avatarUrl     String?
  status        UserStatus @default(ACTIVE)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])
  role           OrgRole      @default(OWNER)   // 个人用户默认 OWNER，团队版可扩展 MEMBER/ADMIN

  subscription  Subscription?
  usageRecords  UsageRecord[]
  orders        Order[]
  projects      Project[]

  @@index([organizationId])
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

// 预留团队实体，现阶段个人用户不创建 Organization 记录，
// 待团队版上线后再启用注册流程中的组织创建逻辑
model Organization {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  members   User[]
}

enum OrgRole {
  OWNER
  ADMIN
  MEMBER
}

// ── 会员与订阅 ──

model Plan {
  id            String   @id @default(cuid())
  code          String   @unique   // "free" | "pro" | "team"
  name          String
  priceMonthly  Int                // 单位：分，避免浮点误差
  priceYearly   Int?
  // 额度类权益，用量计费的核心字段
  monthlyTokenQuota   BigInt       // 每月可用 token 额度
  monthlyStorageQuotaMB Int        // 存储配额
  maxProjects         Int?          // null 表示不限
  features            Json          // { "deepResearch": true, "ppt": true, "podcast": false, ... }
  createdAt     DateTime @default(now())
}

model Subscription {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id])
  planId        String
  plan          Plan     @relation(fields: [planId], references: [id])
  status        SubStatus @default(ACTIVE)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum SubStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  EXPIRED
}

model Order {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  planId        String
  amount        Int              // 分
  currency      String @default("CNY")
  status        OrderStatus @default(PENDING)
  paymentChannel String?         // "alipay" | "wechat" | "stripe"
  paymentRef    String?          // 第三方支付流水号
  createdAt     DateTime @default(now())
  paidAt        DateTime?
}

enum OrderStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

// ── 用量计量（计费与统计的数据源头）──

model UsageRecord {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  projectId     String?
  feature       UsageFeature      // CHAT / DEEP_RESEARCH / RAG_EMBEDDING / TTS / IMAGE / PPT
  model         String            // 实际调用的模型名，如 gpt-4o-mini
  promptTokens     Int @default(0)
  completionTokens Int @default(0)
  totalTokens      Int @default(0)
  costInCents      Int @default(0)  // 按平台成本核算换算出的内部成本，用于毛利分析
  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
  @@index([feature, createdAt])
}

enum UsageFeature {
  CHAT
  DEEP_RESEARCH
  RAG_EMBEDDING
  RAG_RERANK
  TTS
  IMAGE_GEN
  PPT_GEN
  TRANSLATE
}

// ── 项目（迁移自现有 storage.ts，改为数据库记录 + OSS 存文件本体）──

model Project {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}
```

设计要点说明：

`UsageRecord` 是整个用量计费和会员统计体系的数据源头，每一次 LLM/Embedding/TTS/图片调用都要落一条记录，字段里同时保留了对外计费用的 token 数和对内成本核算用的 `costInCents`，这样后续做"人均成本、毛利率"这类经营指标时不需要再回头补数据。

`Plan.features` 用 JSON 字段承载功能开关，而不是给每个功能单独开一列，这样后续新增 PPT、播客等功能权益时不需要频繁改表结构，只需要改配置。

`Organization`/`OrgRole` 现在就建好，但业务逻辑上个人用户注册时不创建组织记录，`role` 默认 `OWNER`，等团队版真正启动时，只需要新增"创建组织、邀请成员"的业务流程，不需要再迁移数据结构，这是您选择"预留团队扩展"后对应的具体落地方式。

金额字段一律用整数"分"存储（`priceMonthly`、`amount`、`costInCents`），这是财务类数据的标准做法，避免浮点数精度问题导致对账出错。

### 3.3 存储路径重构

现有 `projects/{projectId}/...` 改为按用户隔离：

```
projects/{userId}/{projectId}/meta.json          → 迁移为数据库 Project 表记录，meta.json 可保留做冗余备份
projects/{userId}/{projectId}/{filename}
projects/{userId}/{projectId}/.rag/
projects/{userId}/{projectId}/.audio/
```

`lib/storage.ts` 中所有路径拼接函数需要新增 `userId` 参数，这是数据隔离最基础也是必须优先做的一步，且需要配合后端网关层做"当前请求用户是否有权访问该 `projectId`"的越权校验。

---

## 四、AI 模型代理层（Model Proxy）设计

这是从"工具"转向"计费 SaaS"的技术核心，建议独立成一个模块：

1. 所有原本在前端直接调用 `apiBase/chat/completions` 的逻辑（如 `app/api/chat/route.ts` 中直接透传用户 apiKey），改为后端持有平台自己申请的模型供应商 Key（可以是多个供应商做负载和成本优化）
2. 请求进入网关后，先做三层检查：用户身份是否有效 → 当月 token 额度是否超限（查 Redis 计数缓存，避免每次都查库）→ 功能是否在其会员等级权益范围内（查 `Plan.features`）
3. 调用完成后，从上游返回的 `usage` 字段（OpenAI 兼容接口通常都会返回 `prompt_tokens`/`completion_tokens`）异步写入 `UsageRecord`，同时更新 Redis 里的月度用量计数器
4. 对于流式响应（现有 `chat/route.ts` 已经是 SSE 流式），需要在流结束时从最后一个 chunk 或额外的 usage 事件中提取 token 数，这里 OpenAI 兼容接口在 `stream_options: {include_usage: true}` 时会在流的最后返回 usage，需要在迁移时显式开启

这一层做完之后，"会员统计"才有真正可用的数据源：可以统计人均月度 token 消耗、各功能模块的调用占比、付费用户与免费用户的用量差异，这些是后续做增长和定价调整的依据。

---

## 五、会员权益与收入模式

### 5.1 建议的分级结构（示例，具体定价需结合成本核算）

| 等级 | 月度 Token 额度 | 存储空间 | 项目数量 | 功能权限 |
|---|---|---|---|---|
| Free | 较小额度（如 50 万 token） | 500MB | 3 个 | 基础对话 + RAG，不含 Deep Research/PPT/播客 |
| Pro | 中等额度（如 500 万 token） | 5GB | 不限 | 全功能解锁 |
| Team（预留） | 按成员数叠加额度 | 按成员数叠加 | 不限 | 全功能 + 团队共享空间 |

额度用尽后的处理策略需要产品决策：可以是硬性拦截并提示升级，也可以是允许超额但按超出部分阶梯计费（更接近真实云服务商的做法）。建议第一版先做硬性额度拦截，逻辑简单、财务风险低，后续再迭代超额计费。

### 5.2 支付渠道

国内场景建议优先接入支付宝当面付/电脑网站支付，微信支付作为第二选择；由于当前 `package.json` 未包含任何支付 SDK，这块是全新依赖，需要在后端 `billing` 模块中新增支付回调路由，并且必须做签名验签和幂等处理（防止支付回调重复触发导致重复开通会员）。

---

## 六、迁移路线图（分阶段）

### 阶段一：地基搭建（不影响现有功能可用性）✅ 已完成
- ✅ 仓库重构为 pnpm Monorepo：`apps/web`（原前端）+ `apps/api`（新后端）+ 根目录 workspace 脚本
- ✅ 初始化 PostgreSQL + Prisma，落地 User/Organization/Plan/Subscription/Order/UsageRecord/Project 表结构，并完成首次 migration
- ✅ 新建 Fastify 后端服务骨架，实现注册 `/auth/register`、登录 `/auth/login`、刷新 `/auth/refresh`、鉴权保护路由 `/auth/me`；注册时自动创建个人 Organization，为团队版预留扩展
- ✅ 本地开发环境：Colima + Docker（配置国内镜像加速）跑 PostgreSQL 容器，`docker-compose.yml` 固化编排
- ✅ 生产部署配置：`apps/api/Dockerfile`（多阶段构建）+ `docker-entrypoint.sh`（启动前自动 `prisma migrate deploy`）；`apps/web` 的 Vercel Root Directory 需手动设置为 `apps/web`（详见「部署说明」章节）
- ⏳ 待办：`lib/storage.ts` 改造为按 `userId` 隔离路径，同时保留兼容期的数据迁移脚本（放到阶段二一并处理，因为需要先有后端鉴权中间件把 userId 传递给存储层）

### 阶段二：核心迁移（前后端拆分主体工程）
- 将 `app/api/*` 下的业务路由（projects、chat、deep-research、rag、生成类接口）迁移到 Fastify `/modules` 下，逻辑基本平移（现有 `lib/` 下代码是纯函数式，可直接复用）
- 前端改造为纯客户端渲染 + 调用新后端域名，替换掉原先直接 `fetch("/api/xxx")` 的相对路径为绝对后端地址
- 收敛 `lib/ai-config.ts` 中硬编码的默认 API Key，改为后端环境变量持有

### 阶段三：计费闭环
- 实现 Model Proxy 层，接入平台自有模型 Key，落地 `UsageRecord` 写入
- 接入支付渠道，打通 Order → Subscription 开通流程
- 实现会员额度拦截与到期提醒

### 阶段四：数据运营
- 会员统计看板（新增用户数、付费转化率、人均 token 消耗、留存率等）
- 团队版数据模型正式启用（若业务验证后决定推进）

---

## 七、需要用户明确决策的遗留问题

1. 免费版和付费版的具体额度、价格需要结合真实的模型调用成本核算，建议先跑一段时间用量统计再定价
2. 超额后的策略（硬拦截 vs 阶梯计费）
3. 支付渠道的商户资质是否已具备（个人开发者接入支付宝/微信支付企业商户通常需要营业执照）
4. 团队版的具体启动时间点，决定 `Organization` 相关业务逻辑何时开发

---

## 八、部署说明

Monorepo 拆分之后，`apps/web` 和 `apps/api` 是两个独立部署单元，各自有自己的部署路径，不会互相影响。

### 8.1 前端 `apps/web` → Vercel

仓库根目录下多个项目共存时，Vercel 需要手动指定 "Root Directory" 为 `apps/web`，否则会尝试从仓库根目录寻找 `next.config.ts` 而失败。操作路径：Vercel 项目 → Settings → General → Root Directory，填入 `apps/web`。本地 `apps/web/.vercel/repo.json` 中的 `directory` 字段已经同步改为 `apps/web`，但这只是本地缓存，线上生效必须在控制台里手动确认一次。构建命令、输出目录等其余配置沿用 Next.js 默认值即可，Vercel 会自动识别到这是一个 pnpm workspace 并只安装 `apps/web` 所需的依赖子集。

### 8.2 后端 `apps/api` → 容器化部署

后端不适合 Serverless 化（需要长连接的 PostgreSQL 连接池、以及未来可能的 WebSocket/SSE 流式响应），因此走标准容器部署：

- `apps/api/Dockerfile` 是三段式多阶段构建（依赖安装 → 编译 + Prisma Client 生成 → 精简运行时镜像），最终镜像只包含生产依赖和编译产物，不含源码和开发依赖
- `apps/api/docker-entrypoint.sh` 会在容器启动时先执行 `prisma migrate deploy`（只回放已有迁移，不会像 `migrate dev` 那样交互式生成新迁移），再启动服务，保证每次上线自动同步表结构
- 生产环境变量（`DATABASE_URL`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`CORS_ORIGIN` 等）通过部署平台的环境变量注入，不要打进镜像里；`JWT_*_SECRET` 生产环境务必用 `openssl rand -base64 32` 生成的强随机值替换 `.env.example` 中的开发占位值
- 具体托管在哪个平台（阿里云 ACK/ECS + 自建 Docker、Railway、Render、Fly.io 等）取决于后续的成本和运维偏好，`Dockerfile` 本身是平台无关的标准产物，可以直接对接任意支持 Docker 镜像部署的平台

### 8.3 本地一键联调

仓库根目录的 `docker-compose.yml` 编排了 `postgres` + `api` 两个服务，本地验证生产构建行为时可以直接：

```bash
JWT_ACCESS_SECRET=$(openssl rand -base64 32) \
JWT_REFRESH_SECRET=$(openssl rand -base64 32) \
docker compose up --build
```

日常开发不需要跑完整容器编排，`pnpm dev:web`（前端热更新）+ `pnpm dev:api`（后端 tsx watch 热更新）+ 单独跑 `mynotes-postgres` 容器即可，编译速度更快。
