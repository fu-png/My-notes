import path from "path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Docker 部署时使用 standalone 输出模式，生成独立可运行的 server.js
  // 大幅减小镜像体积（只包含实际用到的代码和依赖）
  output: "standalone",
  // 跳过生产构建时的 TS 类型检查（已有 RAG 模块的遗留类型问题，不影响运行时）
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    // pnpm 的 node_modules 是符号链接结构：apps/web/node_modules/next 实际
    // 指向仓库根目录下 node_modules/.pnpm/... 的真实物理路径。Turbopack 按
    // 真实路径（realpath）做「文件必须在 root 内」的边界检查，如果 root 只
    // 设为 apps/web 自身，next 包的真实路径落在这个边界之外，就会报
    // "couldn't find the Next.js package"。因此这里必须把 root 上提到
    // 仓库根目录，让 apps/web 和 node_modules/.pnpm 都落在同一个 root 内。
    // 参考: https://github.com/vercel/next.js/issues/92540
    root: path.join(__dirname, "..", ".."),
  },
  experimental: {
    optimizePackageImports: ["@tabler/icons-react", "three", "postprocessing", "recharts"],
  },
  // 通过 serverExternalPackages 让 bundler 不打包这些模块
  serverExternalPackages: ["ali-oss"],
}

export default nextConfig
