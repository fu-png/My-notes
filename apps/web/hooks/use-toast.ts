"use client"

import * as React from "react"

// ─── Toast Queue System ───
// 专业级 Toast：支持多条排队、自动消失、动画进出

export interface ToastItem {
  id: string
  type: "success" | "error" | "info"
  msg: string
  /** 创建时间 */
  createdAt: number
  /** 是否正在退出动画中 */
  exiting?: boolean
}

const TOAST_DURATION = 3000 // 3s 自动消失
const EXIT_ANIMATION_MS = 300 // 退出动画时长
const MAX_VISIBLE = 3 // 最多同时显示

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const timerMapRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = React.useCallback((id: string) => {
    // 先标记为 exiting 触发退出动画
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    // 清理自动消失定时器（如果有）
    const existingTimer = timerMapRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    // 动画结束后真正移除（同时追踪此定时器以便卸载时清理）
    const exitTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timerMapRef.current.delete(id)
    }, EXIT_ANIMATION_MS)
    timerMapRef.current.set(id, exitTimer)
  }, [])

  const showToast = React.useCallback(
    (type: "success" | "error" | "info", msg: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const item: ToastItem = { id, type, msg, createdAt: Date.now() }

      setToasts((prev) => {
        const next = [...prev, item]
        // 超过最大数量时，移除最早的（先标记退出）
        if (next.length > MAX_VISIBLE) {
          const oldest = next[0]
          // 触发异步移除
          setTimeout(() => removeToast(oldest.id), 0)
        }
        return next
      })

      // 自动消失
      const timer = setTimeout(() => removeToast(id), TOAST_DURATION)
      timerMapRef.current.set(id, timer)
    },
    [removeToast]
  )

  // 清理所有定时器
  React.useEffect(() => {
    const timers = timerMapRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  return { toasts, showToast, removeToast }
}
