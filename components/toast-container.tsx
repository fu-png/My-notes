"use client"

import * as React from "react"
import { IconCheck, IconX, IconAlertCircle } from "@tabler/icons-react"
import type { ToastItem } from "@/hooks/use-toast"

// ─── Toast Container ───
// 渲染 Toast 队列，支持进出动画、手动关闭

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const ICON_MAP = {
  success: IconCheck,
  error: IconAlertCircle,
  info: IconAlertCircle,
} as const

const STYLE_MAP = {
  success: {
    bg: "bg-emerald-600 dark:bg-emerald-700",
    icon: "text-emerald-100",
  },
  error: {
    bg: "bg-red-600 dark:bg-red-700",
    icon: "text-red-100",
  },
  info: {
    bg: "bg-blue-600 dark:bg-blue-700",
    icon: "text-blue-100",
  },
} as const

export const ToastContainer = React.memo(function ToastContainer({
  toasts,
  onDismiss,
}: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col-reverse gap-2" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICON_MAP[toast.type]
        const style = STYLE_MAP[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg transition-all duration-300 ${
              style.bg
            } ${
              toast.exiting
                ? "translate-y-2 scale-95 opacity-0"
                : "translate-y-0 scale-100 opacity-100 animate-in fade-in slide-in-from-bottom-2"
            }`}
          >
            <Icon className={`size-4 shrink-0 ${style.icon}`} />
            <span className="max-w-[280px] leading-snug">{toast.msg}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="关闭通知"
              className="ml-1 shrink-0 rounded p-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
})
