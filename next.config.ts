import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {
    // 显式指定项目根目录，防止 Turbopack 因检测到上层目录的 lockfile
    // （如 ~/package-lock.json）而将文件系统监听范围扩大到整个 home 目录
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ["@tabler/icons-react", "three", "postprocessing", "recharts"],
  },
  // 通过 serverExternalPackages 让 bundler 不打包这些模块
  serverExternalPackages: ["ali-oss"],
}

export default nextConfig
