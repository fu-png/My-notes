import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@tabler/icons-react"],
  },
  // Vectra 动态 require @huggingface/transformers（可选依赖，我们用自己的 embedding API）
  // 通过 serverExternalPackages 让 bundler 不打包这些模块
  serverExternalPackages: ["vectra", "@huggingface/transformers"],
  outputFileTracingIncludes: {
    "/api/projects": ["./content/**/*"],
    "/api/projects/[id]": ["./content/**/*"],
    "/api/projects/[id]/files": ["./content/**/*"],
    "/api/projects/[id]/files/[filename]": ["./content/**/*"],
    "/api/uploads": ["./content/**/*"],
    "/api/uploads/[filename]": ["./content/**/*"],
  },
}

export default nextConfig
