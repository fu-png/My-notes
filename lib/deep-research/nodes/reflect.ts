/**
 * Reflect Node — 评估研究覆盖度，决定是否需要补充搜索
 */

import type { DeepResearchState, SubQuestion } from '../types'
import { callLLM } from './llm'

export async function reflectNode(
  state: DeepResearchState
): Promise<Partial<DeepResearchState>> {
  const { learningPath, subQuestions, searchResults, iterationCount, maxIterations, apiKey, apiBase, model } = state

  // 如果已经达到最大迭代次数，直接通过
  if (iterationCount >= maxIterations) {
    return {
      isSufficient: true,
      coverage: 1.0,
      streaming: {
        ...state.streaming,
        currentPhase: 'reflect',
        currentStep: '已达到最大搜索轮次，进入整理阶段',
        progress: 65,
        log: [...state.streaming.log, `[Reflect] 达到最大轮次 (${maxIterations})，强制完成`],
      },
    }
  }

  // 让 LLM 评估覆盖度
  const systemPrompt = `你是一位研究质量评估专家。请评估当前的研究材料是否充分覆盖了学习路径的各个方面。

学习路径：
${JSON.stringify(learningPath, null, 2)}

子问题列表及搜索状态：
${subQuestions.map(q => `- [${q.status}] ${q.question}`).join('\n')}

搜索结果数量：${searchResults.length} 条

请评估：
1. 每个学习阶段的覆盖度（0-1）
2. 是否存在知识盲区
3. 是否需要补充搜索

输出严格 JSON（不要 markdown 标记）：
{
  "coverage": 0.0到1.0的数字,
  "knowledgeGaps": ["盲区1", "盲区2"],
  "isSufficient": true或false,
  "newSubQuestions": [
    {"id": "q_new_1", "question": "补充子问题", "status": "pending"}
  ]
}`

  const content = await callLLM({
    apiKey,
    apiBase,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请评估研究覆盖度' },
    ],
    temperature: 0.2,
    maxTokens: 2048,
  })

  let parsed: {
    coverage: number
    knowledgeGaps: string[]
    isSufficient: boolean
    newSubQuestions: SubQuestion[]
  }

  try {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    } else {
      // 解析失败，默认充分
      parsed = { coverage: 0.8, knowledgeGaps: [], isSufficient: true, newSubQuestions: [] }
    }
  }

  // 如果不充分，将新子问题加入列表
  const updatedSubQuestions = parsed.isSufficient
    ? state.subQuestions
    : [...state.subQuestions, ...(parsed.newSubQuestions || [])]

  const phaseLabel = parsed.isSufficient ? '研究充分，进入整理阶段' : `覆盖度 ${Math.round(parsed.coverage * 100)}%，补充 ${parsed.newSubQuestions?.length || 0} 个子问题`

  return {
    coverage: parsed.coverage,
    knowledgeGaps: parsed.knowledgeGaps || [],
    isSufficient: parsed.isSufficient,
    subQuestions: updatedSubQuestions,
    streaming: {
      ...state.streaming,
      currentPhase: 'reflect',
      currentStep: phaseLabel,
      progress: parsed.isSufficient ? 65 : 40,
      log: [...state.streaming.log, `[Reflect] 覆盖度: ${parsed.coverage}, 充分: ${parsed.isSufficient}`],
    },
  }
}
