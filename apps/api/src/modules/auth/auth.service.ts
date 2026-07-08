import bcrypt from "bcryptjs"
import type { PrismaClient } from "@prisma/client"

const SALT_ROUNDS = 12

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = "AuthError"
  }
}

/**
 * 注册新用户，并自动创建一个"个人组织"（isPersonal=true）。
 * 现阶段以个人用户为主，但复用 Organization 模型为后续团队协作预留扩展空间。
 */
export async function registerUser(
  prisma: PrismaClient,
  input: { email: string; password: string; name?: string }
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw new AuthError("该邮箱已被注册", 409)
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      memberships: {
        create: {
          role: "OWNER",
          organization: {
            create: {
              name: input.name ? `${input.name} 的空间` : "我的空间",
              isPersonal: true,
            },
          },
        },
      },
    },
    include: { memberships: { include: { organization: true } } },
  })

  const personalOrg = user.memberships[0].organization
  return { user, organizationId: personalOrg.id }
}

export async function verifyCredentials(
  prisma: PrismaClient,
  input: { email: string; password: string }
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { where: { role: "OWNER" }, include: { organization: true } } },
  })

  if (!user) {
    throw new AuthError("邮箱或密码错误", 401)
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) {
    throw new AuthError("邮箱或密码错误", 401)
  }

  const personalOrg = user.memberships.find((m) => m.organization.isPersonal) ?? user.memberships[0]
  if (!personalOrg) {
    throw new AuthError("用户缺少归属组织，请联系管理员", 500)
  }

  return { user, organizationId: personalOrg.organizationId }
}
