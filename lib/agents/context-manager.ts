/**
 * Context Manager — 统一的 AI 对话上下文装配
 *
 * 负责根据当前状态（RAG结果、Web搜索结果、活跃文件、选中文本）
 * 构建正确的 system prompt
 *
 * Extracted from notebook-workspace.tsx lines 1100-1147
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextInputs {
  // RAG results
  ragContextText?: string
  ragSources?: Array<{
    fileTitle: string
    headingPath: string[]
  }>

  // Web search results
  webContextText?: string
  webSources?: Array<{
    query?: string
    url?: string
  }>
  webSearchTriggered?: boolean

  // Active document
  activeFile?: string | null
  activeFileName?: string
  fileContent?: string

  // Selected text
  selectedText?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the "互联网检索结果" block that is spliced into several branches.
 * Returns an empty string when there is no web context.
 */
function buildWebContextBlock(inputs: ContextInputs): string {
  const { webContextText, webSources } = inputs

  if (!webContextText) {
    return ""
  }

  const queryPart = webSources?.[0]?.query
    ? `搜索词: 「${webSources[0].query}」`
    : ""
  const urlPart = webSources?.[0]?.url
    ? `来源: ${webSources[0].url}`
    : ""

  return `\n\n## 互联网检索结果\n以下是实时从互联网获取的内容（${queryPart}${urlPart}）：\n\n${webContextText}\n\n## 使用说明\n- 请基于以上互联网内容回答用户问题，优先引用搜索结果中的事实和数据\n- 可以结合自己的知识进行补充和分析，但要区分搜索结果和自身推断\n- 如果搜索结果与问题不完全匹配，提取相关部分并说明\n- 回答中引用具体来源时标注 URL 链接`
}

/**
 * Append the "用户选中的文本" section when selectedText is present.
 */
function appendSelectedText(prompt: string, selectedText?: string): string {
  if (!selectedText) {
    return prompt
  }

  return (
    prompt +
    `\n\n## 用户选中的文本\n用户在文档中划选了以下内容，请针对这段内容回答用户的问题：\n\n"""\n${selectedText}\n"""\n\n请围绕这段选中文本来回答，如果用户的问题与选中文本无直接关联，也可以结合全文内容回答。`
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete system prompt based on the current context inputs.
 *
 * The five mutually-exclusive branches (evaluated in order):
 *   1. RAG context available (ragContextText && ragSources)
 *   2. Web search context only (webContextText)
 *   3. Web search triggered but empty result
 *   4. Active file open (no RAG, no web)
 *   5. No file selected (default)
 *
 * After the branch, a `selectedText` block is conditionally appended.
 */
export function buildSystemPrompt(inputs: ContextInputs): string {
  const {
    ragContextText,
    ragSources,
    webContextText,
    webSearchTriggered,
    activeFile,
    activeFileName,
    fileContent,
    selectedText,
  } = inputs

  const webContextBlock = buildWebContextBlock(inputs)

  let systemPrompt: string

  // ----- Branch 1: RAG context available -----
  if (ragContextText && ragSources && ragSources.length > 0) {
    const sourceList = ragSources
      .map(
        (s, i) =>
          `  来源 ${i + 1}: ${s.fileTitle}${s.headingPath.length > 0 ? ` > ${s.headingPath.join(" > ")}` : ""}`
      )
      .join("\n")

    systemPrompt = `你是一个基于文档知识库的 AI 助手。你的回答必须严格遵循以下规则：

## 已检索到的参考资料
以下是从用户笔记本中检索到的相关内容片段：

${ragContextText}

## 来源清单
${sourceList}

${activeFile ? `## 当前打开的文档\n用户正在查看「${activeFileName}」，文档内容：\n${fileContent}` : ""}${webContextBlock}

## 回答规范
1. **优先使用检索到的参考资料**回答问题。引用具体内容时，使用 [来源 N] 标注出处。
2. 如果参考资料中没有足够信息回答问题，你可以基于自己的知识补充，但必须明确说明："以下内容不来自笔记本中的文档，建议独立验证。"
3. 如果问题完全无法从参考资料和你的知识中回答，坦诚说明你不确定，而不是编造答案。
4. 回复使用中文。
5. 如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
  }

  // ----- Branch 2: Web search context only -----
  else if (webContextText) {
    systemPrompt = `你是一个笔记 AI 助手，具备互联网搜索能力。${activeFile ? `用户当前正在查看文档「${activeFileName}」。` : ""}${webContextBlock}\n\n回复请使用中文。如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
  }

  // ----- Branch 3: Web search triggered but empty result -----
  else if (webSearchTriggered && !webContextText) {
    systemPrompt = `你是一个笔记 AI 助手。${activeFile ? `用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}\n\n` : ""}用户的问题可能涉及实时信息，但互联网搜索未能获取到结果。请基于你自己的知识尽力回答，并在回答末尾说明「注：联网搜索未返回结果，以上内容基于模型知识，可能不是最新信息。」\n\n回复请使用中文。如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
  }

  // ----- Branch 4: Active file open (no RAG, no web) -----
  else if (activeFile) {
    systemPrompt = `你是一个笔记 AI 助手。用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}\n\n请基于文档内容回答用户的问题，帮助用户理解、总结、润色或扩展文档内容。回复请使用中文。\n\n【重要】如果用户要求你修改、润色、重写、翻译或编辑文档内容，你需要将修改后的完整文档内容放在 <doc-update> 和 </doc-update> 标签之间。这会自动更新中间区域的文档。在标签之外简要说明你做了什么修改即可。例如：\n我已经帮你润色了文档，主要修改了...\n<doc-update>\n修改后的完整文档内容\n</doc-update>`
  }

  // ----- Branch 5: No file selected (default) -----
  else {
    systemPrompt =
      "你是一个笔记 AI 助手，具备互联网搜索能力。用户还没有选择文档，请友好地引导用户选择一个文档开始工作。用户也可以发送链接或以「搜索」开头来搜索互联网内容。回复请使用中文。"
  }

  // ----- Selected text injection (appended to any branch) -----
  systemPrompt = appendSelectedText(systemPrompt, selectedText)

  return systemPrompt
}
