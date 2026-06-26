"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { IconArrowRight } from "@tabler/icons-react"

const PixelBlast = dynamic(() => import("@/components/pixel-blast"), {
  ssr: false,
})

export default function Home() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // 亮色模式用浅灰色粒子，暗色模式用低对比度的深灰色粒子
  const isDark = mounted && resolvedTheme === "dark"
  const pixelColor = isDark ? "#333333" : "#c1c1c1"

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden">
      {/* PixelBlast background */}
      <div className="pointer-events-auto absolute inset-0 -z-10">
        <PixelBlast
          variant="circle"
          pixelSize={6}
          color={pixelColor}
          patternScale={3}
          patternDensity={1.2}
          pixelSizeJitter={0.5}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          speed={0.6}
          edgeFade={0.25}
          transparent
        />
      </div>

      {/* Theme toggle in the corner */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Hero content — pointer-events-none lets clicks pass through to PixelBlast canvas */}
      <div className="pointer-events-none relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
          My Notes
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          个人笔记与知识管理
        </p>
        <Link
          href="/docs/projects"
          className="pointer-events-auto mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
        >
          进入应用
          <IconArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  )
}
