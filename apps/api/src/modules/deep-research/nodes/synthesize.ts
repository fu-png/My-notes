/**
 * Synthesize Node — 整合所有搜索结果，生成一篇深度研究报告（不少于 5000 字）
 *
 * 迁移自 apps/web/lib/deep-research/nodes/synthesize.ts（无改动）
 */

import type { DeepResearchState, SynthesizedDoc } from '../types.js'
import { callLLM } from './llm.js'

export async function synthesizeNode(
  state: DeepResearchState
): Promise<Partial<DeepResearchState>> {
  const { learningPath, searchResults, sources, userQuery, apiKey, apiBase, model } = state

  // 准备搜索结果上下文（增大容量，为生成长报告提供充分素材）
  const searchContext = searchResults
    .slice(0, 15)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n内容:\n${r.content.slice(0, 1200)}`)
    .join('\n\n---\n\n')

  // 构造来源列表
  const sourcesList = sources
    .slice(0, 15)
    .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
    .join('\n')

  // 构造学习路径描述
  const pathDesc = learningPath
    .map((s, i) => `第 ${i + 1} 阶段 — ${s.stage}：${s.topics.join('、')}`)
    .join('\n')

  const systemPrompt = `你是一位资深的技术研究专家和知识整理大师。你的任务是基于提供的研究材料，撰写一份**深度研究报告**。

## 写作要求

1. **篇幅要求**：报告总字数**不得少于 5000 字**，力争 6000-8000 字。每个章节都要充分展开论述，不能只有概括性描述。
2. **深度要求**：不是简单罗列，而是深入分析原理、机制、优缺点、适用场景。对核心概念要有深入浅出的解释。
3. **结构要求**：使用 Markdown 格式，结构层次清晰，必须包含以下章节：
   - **概述**（500字以上）：研究方向的背景、重要性、本报告涵盖的范围
   - **分阶段知识点详解**（每个阶段 800-1500 字）：按学习路径逐一展开，每个知识点要有原理解释、代码示例（如适用）、实际应用场景
   - **核心对比分析**（500字以上）：与相关技术或方案的对比，优劣势分析
   - **最佳实践与常见陷阱**（500字以上）：实际开发中的经验总结、常见错误和避坑指南
   - **总结与展望**（300字以上）：回顾要点，展望未来趋势
   - **参考资源**：列出所有参考来源链接
4. **内容风格**：专业严谨但通俗易懂，像一位资深工程师写给团队的深度技术分享文章。
5. **代码示例**：在合适的地方提供代码示例，代码要有注释说明。

## Markdown 格式规范（极其重要，必须严格遵守）

1. **标题层级**：用 # 表示一级标题（整篇只有一个），## 表示二级标题，### 表示三级标题，#### 表示四级标题。标题前必须有一个空行。
2. **代码块**：所有代码必须用三个反引号包裹，并标注语言类型。示例：
   \`\`\`javascript
   // 你的代码
   \`\`\`
   绝对不可以在正文中直接写裸代码。代码块前后各留一个空行。
3. **列表**：无序列表用 - 开头，有序列表用 1. 2. 3. 开头。列表前必须有一个空行。
4. **段落**：段落之间用一个空行分隔。不要使用 HTML 标签（如 <h1>、<p>、<div> 等），全部用 Markdown 语法。
5. **加粗和强调**：用 **加粗** 和 *斜体*，不要用 HTML 的 <b> 或 <em> 标签。
6. **代码块中禁止出现 Markdown 标题语法**：如果代码中有 # 号开头的注释，确保它们在代码围栏内部。

直接输出 Markdown 内容，以 # 标题开头。不要输出任何前言、解释或元信息。`

  const userPrompt = `## 研究主题
${userQuery}

## 学习路径规划
${pathDesc}

## 研究材料
${searchContext.slice(0, 12000)}

## 参考来源列表
${sourcesList}

请基于以上材料，撰写一份关于「${userQuery}」的深度研究报告。

重要提醒：
- 报告不少于 5000 字，每个章节都要充分展开
- 所有代码片段必须用 \`\`\` 代码围栏包裹并标注语言（如 \`\`\`javascript），绝对不能出现裸代码
- 不要使用任何 HTML 标签，只使用纯 Markdown 语法`

  const content = await callLLM({
    apiKey,
    apiBase,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    maxTokens: 16384,
  })

  // 生成来源引用附录（如果 LLM 生成的内容中没有参考来源章节）
  const hasSourcesSection = content.includes('## 参考') || content.includes('## 参考资源') || content.includes('## 参考来源')
  const sourcesAppendix = (!hasSourcesSection && sources.length > 0)
    ? '\n\n---\n\n## 参考来源\n\n' + sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join('\n')
    : ''

  const finalContent = content + sourcesAppendix

  const docs: SynthesizedDoc[] = [{
    filename: `${userQuery.slice(0, 20).replace(/[/\\:*?"<>|]/g, '_')}-学习笔记.md`,
    title: `${userQuery} - 学习笔记`,
    content: finalContent,
    stage: 'all',
    sources: sources.slice(0, 15),
  }]

  return {
    synthesizedDocs: docs,
    streaming: {
      ...state.streaming,
      currentPhase: 'synthesize',
      currentStep: '学习笔记已生成',
      progress: 85,
      log: [...state.streaming.log, `[Synthesize] 生成 1 篇深度研究报告（约 ${finalContent.length} 字）`],
    },
  }
}
