/**
 * Source Grounding Prompt 模板
 *
 * 参考 NotebookLM 的 Source Grounding 机制设计：
 * - 强制基于检索内容回答
 * - 标注出处
 * - 承认知识边界
 */

import type { AssembledContext } from "./types.js"

/**
 * 生成带 RAG 上下文的 System Prompt
 *
 * 当 RAG 开启时，替换原有的简单 system prompt
 */
export function buildRAGSystemPrompt(
  context: AssembledContext,
  activeFileName?: string,
  activeFileContent?: string
): string {
  const hasContext = context.text.length > 0
  const hasActiveFile = activeFileName && activeFileContent

  // 当有 RAG 上下文时，截断当前文件内容以防止 token 溢出
  // 估算比率：1.5 字符/token（中英混合），RAG 模式下限 6000 字符（≈4000 tokens）
  const MAX_ACTIVE_FILE_CHARS = hasContext ? 6000 : 16000
  const truncatedFileContent = activeFileContent && activeFileContent.length > MAX_ACTIVE_FILE_CHARS
    ? activeFileContent.slice(0, MAX_ACTIVE_FILE_CHARS) + "\n\n[... 文档内容过长，已截断]"
    : activeFileContent

  // 构建来源清单
  const sourceList = context.sources
    .map(
      (s, i) =>
        `  来源 ${i + 1}: ${s.fileTitle}${s.headingPath.length > 0 ? ` > ${s.headingPath.join(" > ")}` : ""}`
    )
    .join("\n")

  return `你是一个基于文档知识库的 AI 助手。你的回答必须严格遵循以下规则：

## 信息来源规则

${hasContext ? `### 已检索到的参考资料
以下是从用户笔记本中检索到的相关内容片段：

${context.text}

### 来源清单
${sourceList}` : "### 未检索到相关参考资料\n知识库中没有找到与问题直接相关的内容。"}

${hasActiveFile ? `### 当前打开的文档
用户正在查看「${activeFileName}」，文档内容：
${truncatedFileContent}` : ""}

## 回答规范

1. **优先使用检索到的参考资料**回答问题。引用具体内容时，使用 [来源 N] 标注出处。
2. 如果参考资料中没有足够信息回答问题，你可以基于自己的知识补充，但必须明确说明："以下内容不来自笔记本中的文档，建议独立验证。"
3. 如果问题完全无法从参考资料和你的知识中回答，坦诚说明你不确定，而不是编造答案。
4. 回复使用中文。
5. 如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。

## 引用格式示例

正确："根据文档，Claude Code 使用对话循环作为核心架构 [来源 1]。工具系统通过标准化接口与外部交互 [来源 3]。"
错误："Claude Code 使用了很多技术。"（没有引用来源）`
}

/**
 * 生成不使用 RAG 时的原始 System Prompt（保持向后兼容）
 */
export function buildPlainSystemPrompt(
  activeFileName?: string,
  activeFileContent?: string
): string {
  if (activeFileName && activeFileContent) {
    // 截断超长文档内容，防止 token 溢出（非 RAG 模式给予更大预算）
    const MAX_CHARS = 16000
    const truncated = activeFileContent.length > MAX_CHARS
      ? activeFileContent.slice(0, MAX_CHARS) + "\n\n[... 文档内容过长，已截断]"
      : activeFileContent
    return `你是一个笔记 AI 助手。用户当前正在查看文档「${activeFileName}」。文档内容如下：

${truncated}

请基于文档内容回答用户的问题，帮助用户理解、总结、润色或扩展文档内容。回复请使用中文。

【重要】如果用户要求你修改、润色、重写、翻译或编辑文档内容，你需要将修改后的完整文档内容放在 <doc-update> 和 </doc-update> 标签之间。这会自动更新中间区域的文档。在标签之外简要说明你做了什么修改即可。例如：
我已经帮你润色了文档，主要修改了...
<doc-update>
修改后的完整文档内容
</doc-update>`
  }

  return "你是一个笔记 AI 助手。用户还没有选择文档，请友好地引导用户选择一个文档开始工作。回复请使用中文。"
}
