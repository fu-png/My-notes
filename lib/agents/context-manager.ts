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
  /** Web search was attempted but failed (network error or API error) */
  webFetchError?: boolean
  /** RAG query was attempted but failed */
  ragFetchError?: boolean

  // Active document
  activeFile?: string | null
  activeFileName?: string
  fileContent?: string

  // Selected text
  selectedText?: string

  // Agent role — when present, replaces the default "你是一个笔记 AI 助手" role description
  agentRole?: string

  // User preferences / Persona
  personaPrompt?: string
  userName?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters of active file content to include in system prompt */
const MAX_FILE_CONTENT_CHARS_RAG = 6000
const MAX_FILE_CONTENT_CHARS_PLAIN = 16000

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the "互联网检索结果" block that is spliced into several branches.
 * Returns an empty string when there is no web context.
 */
function buildWebContextBlock(inputs: ContextInputs, startIndex: number = 1): string {
  const { webContextText, webSources } = inputs

  if (!webContextText) {
    return ""
  }

  // 构建编号化的 Web 来源列表（与 RAG 来源编号体系统一）
  const webSourceList = webSources && webSources.length > 0
    ? webSources
        .map((s, i) => {
          const idx = startIndex + i
          const parts = [s.query ? `搜索词「${s.query}」` : "", s.url || ""].filter(Boolean)
          return `  来源 ${idx} [互联网]: ${parts.join(" — ")}`
        })
        .join("\n")
    : ""

  return `\n\n## 互联网检索结果\n以下是实时从互联网获取的内容：\n\n${webContextText}\n${webSourceList ? `\n## 互联网来源清单\n${webSourceList}\n` : ""}\n## 使用说明\n- 请基于以上互联网内容回答用户问题，优先引用搜索结果中的事实和数据\n- 引用互联网来源时，使用 [来源 N] 标注出处（编号接续笔记本来源）\n- 可以结合自己的知识进行补充和分析，但要区分搜索结果和自身推断\n- 如果搜索结果与问题不完全匹配，提取相关部分并说明`
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
    webFetchError,
    ragFetchError,
    activeFile,
    activeFileName,
    fileContent: rawFileContent,
    selectedText,
    agentRole,
  } = inputs

  // 当有智能体角色时，使用智能体角色作为 AI 身份；否则用默认的笔记助手角色
  const role = agentRole || "你是一个笔记 AI 助手"

  // [P0 FIX] Truncate fileContent to prevent oversized system prompts
  const isRagMode = !!(ragContextText && ragSources && ragSources.length > 0)
  const maxChars = isRagMode ? MAX_FILE_CONTENT_CHARS_RAG : MAX_FILE_CONTENT_CHARS_PLAIN
  let fileContent = rawFileContent || ""
  let fileContentTruncated = false
  if (fileContent.length > maxChars) {
    fileContent = fileContent.slice(0, maxChars)
    fileContentTruncated = true
  }
  const truncationNote = fileContentTruncated ? "\n（注：文档内容较长，已截取前部分用于分析。如需查看特定部分，请告知。）" : ""

  let systemPrompt: string

  // ----- Branch 1: RAG context available -----
  if (ragContextText && ragSources && ragSources.length > 0) {
    const sourceList = ragSources
      .map(
        (s, i) =>
          `  来源 ${i + 1} [笔记本]: ${s.fileTitle}${s.headingPath.length > 0 ? ` > ${s.headingPath.join(" > ")}` : ""}`
      )
      .join("\n")

    // Web 来源编号从 RAG 来源之后开始，确保编号体系统一
    const webBlock = buildWebContextBlock(inputs, ragSources.length + 1)

    systemPrompt = `${role}。你的回答必须严格遵循以下规则：

## 已检索到的参考资料
以下是从用户笔记本中检索到的相关内容片段：

${ragContextText}

## 来源清单
${sourceList}

${activeFile ? `## 当前打开的文档\n用户正在查看「${activeFileName}」，文档内容：\n${fileContent}${truncationNote}` : ""}${webBlock}

## 回答规范
1. **优先使用检索到的参考资料**回答问题。引用具体内容时，使用 [来源 N] 标注出处（笔记本和互联网来源使用统一编号）。
2. 如果参考资料中没有足够信息回答问题，你可以基于自己的知识补充，但必须明确说明："以下内容不来自笔记本中的文档，建议独立验证。"
3. 如果问题完全无法从参考资料和你的知识中回答，坦诚说明你不确定，而不是编造答案。
4. 回复使用中文。
5. 如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
  }

  // ----- Branch 2: Web search context only -----
  else if (webContextText) {
    const webBlock = buildWebContextBlock(inputs, 1)
    systemPrompt = `${role}，具备互联网搜索能力。${activeFile ? `用户当前正在查看文档「${activeFileName}」。` : ""}${webBlock}\n\n回复请使用中文。引用互联网来源时，使用 [来源 N] 标注出处。如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
  }

  // ----- Branch 3: Web search triggered but empty result -----
  else if (webSearchTriggered && !webContextText) {
    const failReason = webFetchError
      ? "注：联网搜索请求失败（网络错误或服务不可用），以上内容基于模型知识，可能不是最新信息。"
      : "注：联网搜索未返回结果，以上内容基于模型知识，可能不是最新信息。"
    systemPrompt = `${role}。${activeFile ? `用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}${truncationNote}\n\n` : ""}用户的问题可能涉及实时信息，但互联网搜索未能获取到结果。请基于你自己的知识尽力回答，并在回答末尾说明「${failReason}」\n\n回复请使用中文。如果用户要求修改文档内容，将修改后的完整文档放在 <doc-update> 和 </doc-update> 标签之间。`
  }

  // ----- Branch 4: Active file open (no RAG, no web) -----
  else if (activeFile) {
    const ragFailNote = ragFetchError ? "\n\n注意：知识库检索失败，以下回答仅基于当前文档内容。" : ""
    systemPrompt = `${role}。用户当前正在查看文档「${activeFileName}」。文档内容如下：\n\n${fileContent}${truncationNote}\n\n请基于文档内容回答用户的问题，帮助用户理解、总结、润色或扩展文档内容。回复请使用中文。${ragFailNote}\n\n【重要】如果用户要求你修改、润色、重写、翻译或编辑文档内容，你需要将修改后的完整文档内容放在 <doc-update> 和 </doc-update> 标签之间。这会自动更新中间区域的文档。在标签之外简要说明你做了什么修改即可。例如：\n我已经帮你润色了文档，主要修改了...\n<doc-update>\n修改后的完整文档内容\n</doc-update>`
  }

  // ----- Branch 5: No file selected (default) -----
  else {
    systemPrompt =
      `${role}，具备互联网搜索能力。用户还没有选择文档，请友好地引导用户选择一个文档开始工作。用户也可以发送链接或以「搜索」开头来搜索互联网内容。回复请使用中文。`
  }

  // ----- Persona injection (applied to any branch) -----
  if (inputs.userName || inputs.personaPrompt) {
    let personaBlock = "\n\n## 用户偏好"
    if (inputs.userName) {
      personaBlock += `\n用户的名字是「${inputs.userName}」，在适当时候可以称呼用户。`
    }
    if (inputs.personaPrompt) {
      personaBlock += `\n以下是用户对 AI 行为风格的自定义要求，请遵循：\n${inputs.personaPrompt}`
    }
    systemPrompt += personaBlock
  }

  // ----- Selected text injection (appended to any branch) -----
  systemPrompt = appendSelectedText(systemPrompt, selectedText)

  return systemPrompt
}

// ---------------------------------------------------------------------------
// Conversation Context Windowing
// ---------------------------------------------------------------------------

/**
 * 估算字符串的 token 数量。
 *
 * 启发式：CJK 字符约 1.5 字符/token，ASCII 字符约 4 字符/token。
 * 不依赖 tiktoken 等外部库，适合客户端快速裁剪。
 */
export function estimateTokens(text: string): number {
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const otherCount = text.length - cjkCount
  return Math.ceil(cjkCount / 1.5 + otherCount / 4)
}

/**
 * 对 API 消息数组施加 token 预算裁剪。
 *
 * - 始终保留 system 消息（第一条）
 * - 从最新消息向前保留，直到预算耗尽
 * - 至少保留最后一条用户消息，即使超出预算
 * - 避免长对话导致 API 延迟增大或 token 上限截断
 */
export function trimConversationHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 12000
): Array<{ role: string; content: string }> {
  if (messages.length <= 2) return messages

  const systemMsg = messages[0]
  const systemTokens = estimateTokens(systemMsg.content)
  const remainingBudget = maxTokens - systemTokens

  if (remainingBudget <= 0) {
    return [systemMsg, messages[messages.length - 1]]
  }

  const conversation = messages.slice(1)
  const kept: Array<{ role: string; content: string }> = []
  let usedTokens = 0

  for (let i = conversation.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(conversation[i].content)
    if (usedTokens + msgTokens > remainingBudget) break
    kept.unshift(conversation[i])
    usedTokens += msgTokens
  }

  // 至少保留最后一条消息
  if (kept.length === 0 && conversation.length > 0) {
    kept.push(conversation[conversation.length - 1])
  }

  return [systemMsg, ...kept]
}
