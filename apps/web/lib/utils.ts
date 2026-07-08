import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 对文件路径中的每个路径段进行 URL 编码，保留 / 分隔符 */
export function encodeFilePath(path: string): string {
  return path.split("/").map((s) => encodeURIComponent(s)).join("/")
}

/** 将时间戳格式化为相对时间描述（如"3 分钟前"、"2 天前"） */
export function formatRelativeTime(timestamp: number | string | Date): string {
  const now = Date.now()
  const then = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime()
  const diff = now - then

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 30) return `${days} 天前`

  const date = new Date(then)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
