"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { SettingsDialog } from "@/components/settings-dialog"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
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
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left side: Logo + Nav */}
        <div className="flex items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="My notes"
            width={120}
            height={45}
            className="h-7 w-auto dark:invert"
          />
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/docs/dashboard"
                ? pathname === "/docs/dashboard"
                : pathname.startsWith(item.href)
            return (
              <Button
                key={item.href}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link href={item.href}>
                  <item.icon className="size-4" data-icon="inline-start" />
                  {item.label}
                </Link>
              </Button>
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
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
