import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@tabler/icons-react"],
  },
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
