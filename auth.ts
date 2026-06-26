import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

// 允许登录的 GitHub 用户名列表（只有你自己）
const ALLOWED_USERS = process.env.ALLOWED_GITHUB_USERS?.split(",") ?? []

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ profile }) {
      // 如果配置了允许列表，则只允许列表中的用户登录
      if (ALLOWED_USERS.length > 0) {
        return ALLOWED_USERS.includes(profile?.login as string)
      }
      // 未配置允许列表时允许所有 GitHub 用户登录
      return true
    },
  },
  pages: {
    signIn: "/login",
  },
})
