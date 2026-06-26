"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { SettingsDialog } from "@/components/settings-dialog"
import {
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  IconLayoutDashboard,
  IconNotebook,
} from "@tabler/icons-react"

const navItems = [
  { href: "/docs/dashboard", label: "仪表盘", icon: IconLayoutDashboard },
  { href: "/docs/projects", label: "我的笔记", icon: IconNotebook },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 items-center justify-between px-4">
        {/* Left side: Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="My notes"
              width={120}
              height={45}
              className="h-8 w-auto dark:invert"
            />
          </Link>

          <nav className="flex h-12 items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/docs/dashboard"
                  ? pathname === "/docs/dashboard"
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 bg-foreground" />
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

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
