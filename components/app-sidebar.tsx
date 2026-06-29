"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { SettingsDialog } from "@/components/settings-dialog"
import {
  TooltipProvider,
} from "@/components/ui/tooltip"

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 items-center justify-between px-4">
        {/* Left side: Logo */}
        <Link href="/docs/projects" className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="My notes"
            width={120}
            height={45}
            className="h-8 w-auto dark:invert"
          />
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={200}>
            <SettingsDialog />
          </TooltipProvider>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
