/**
 * API 路由输入校验工具
 *
 * 提供 projectId 格式校验和 filename 安全过滤，
 * 防止目录遍历攻击和非法路径注入
 */

// projectId 格式：proj-{timestamp} 或 proj-{timestamp}-{random}，如 proj-1782364336281 或 proj-1782364336281-a3b2c1
const PROJECT_ID_RE = /^proj-\d+(?:-[a-z0-9]{2,8})?$/

/**
 * 校验 projectId 格式是否合法
 * 合法格式：proj- 后跟纯数字时间戳
 */
export function isValidProjectId(id: string): boolean {
  return typeof id === "string" && PROJECT_ID_RE.test(id)
}

/**
 * 过滤文件名中的危险字符，防止路径遍历
 * 迭代移除 .. 序列（防止 ....// 绕过），移除反斜杠和路径分隔符
 */
export function sanitizeFilename(filename: string): string {
  let sanitized = filename
  // 迭代移除 .. 序列，防止 ....// 等变体绕过
  while (sanitized.includes("..")) {
    sanitized = sanitized.replace(/\.\./g, "")
  }
  sanitized = sanitized
    .replace(/\\/g, "") // 移除反斜杠
    .replace(/\//g, "") // 移除正斜杠（文件名不应包含路径分隔符）
    .replace(/\0/g, "") // 移除 null 字节
    .replace(/[\x00-\x1f]/g, "") // 移除控制字符
    .trim()
  // 确保结果非空
  return sanitized || "untitled"
}

/**
 * 统一的 projectId 校验失败响应
 */
export function invalidProjectIdResponse() {
  return Response.json({ error: "无效的项目 ID" }, { status: 400 })
}

/**
 * 检查 URL 是否为内网/私有地址（SSRF 防护）
 * 统一的 SSRF 检测函数，拒绝内网地址和非 http/https 协议
 * 覆盖 IPv4/IPv6 私有地址、回环、link-local、.local/.internal TLD
 */
export function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // 仅允许 http/https 协议
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true
    }
    const hostname = parsed.hostname.toLowerCase()
    // 拒绝 IPv4 私有/内网地址
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||          // 127.0.0.0/8
      hostname.startsWith("10.") ||           // 10.0.0.0/8
      hostname.startsWith("192.168.") ||       // 192.168.0.0/16
      hostname.startsWith("169.254.") ||       // 169.254.0.0/16 (link-local)
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) // 172.16.0.0/12
    ) {
      return true
    }
    // 拒绝 IPv6 回环地址
    if (hostname === "[::1]" || hostname === "::1") {
      return true
    }
    // 拒绝 IPv6 私有地址（fc00::/7 范围）
    if (/^\[f[cd][0-9a-f]{2}:/.test(hostname)) {
      return true
    }
    // 拒绝 .local 和 .internal TLD
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return true
    }
    return false
  } catch {
    return true // 无效 URL 视为不安全
  }
}

/**
 * 检查 URL 是否安全可访问（SSRF 防护的便捷封装）
 * 返回 true 表示安全，false 表示不安全
 */
export function isSafeExternalUrl(url: string): boolean {
  return !isInternalUrl(url)
}
