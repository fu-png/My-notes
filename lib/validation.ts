/**
 * API 路由输入校验工具
 *
 * 提供 projectId 格式校验和 filename 安全过滤，
 * 防止目录遍历攻击和非法路径注入
 */

// projectId 格式：proj-{timestamp}，如 proj-1782364336281
const PROJECT_ID_RE = /^proj-\d+$/

/**
 * 校验 projectId 格式是否合法
 * 合法格式：proj- 后跟纯数字时间戳
 */
export function isValidProjectId(id: string): boolean {
  return typeof id === "string" && PROJECT_ID_RE.test(id)
}

/**
 * 过滤文件名中的危险字符，防止路径遍历
 * 移除 .. 和反斜杠，保留字母、数字、中文、点、下划线、连字符、斜杠
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, "") // 移除路径遍历序列
    .replace(/\\/g, "") // 移除反斜杠
    .trim()
}

/**
 * 统一的 projectId 校验失败响应
 */
export function invalidProjectIdResponse() {
  return Response.json({ error: "无效的项目 ID" }, { status: 400 })
}
