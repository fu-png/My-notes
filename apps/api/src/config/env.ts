import { z } from "zod"

/**
 * 环境变量校验 — 启动时立即失败，而不是运行到一半才发现配置缺失
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL 未配置"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET 至少 16 位"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET 至少 16 位"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
})

export type Env = z.infer<typeof envSchema>

let cachedEnv: Env | null = null

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")
    // eslint-disable-next-line no-console
    console.error(`[env] 环境变量校验失败:\n${issues}`)
    process.exit(1)
  }

  cachedEnv = parsed.data
  return cachedEnv
}
