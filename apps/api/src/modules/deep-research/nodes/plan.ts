/**
 * Plan Node — 分析学习方向，拆解子问题，生成学习路径
 *
 * 迁移自 apps/web/lib/deep-research/nodes/plan.ts（无改动）
 */

import type { DeepResearchState, LearningPathItem, SubQuestion } from '../types.js'
import { callLLM } from './llm.js'

export async function planNode(
  state: DeepResearchState
): Promise<Partial<DeepResearchState>> {
  const { userQuery, apiKey, apiBase, model } = state

  const systemPrompt = `你是一位专业的学习路径规划师。用户想学习一个新方向，你需要：

1. 分析这个学习方向
2. 规划 2-3 个学习阶段（从基础到进阶，不要超过 3 个）
3. 每个阶段拆解 2-3 个核心子问题（不要超过 3 个）
4. 输出严格的 JSON 格式

输出格式（必须是合法 JSON，不要包含 markdown 代码块标记）：
{
  "learningPath": [
    {
      "stage": "阶段名称",
      "topics": ["知识点1", "知识点2", "知识点3"],
      "order": 1
    }
  ],
  "subQuestions": [
    {
      "id": "q1",
      "question": "具体子问题",
      "status": "pending"
    }
  ]
}`

  const content = await callLLM({
    apiKey,
    apiBase,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `我想学习：${userQuery}` },
    ],
    temperature: 0.3,
    maxTokens: 4096,
  })

  // 解析 JSON（容错处理）
  let parsed: { learningPath: LearningPathItem[]; subQuestions: SubQuestion[] }
  try {
    // 去除可能的 markdown 代码块标记
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // 如果 JSON 解析失败，尝试从内容中提取
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('Plan Node: LLM 输出无法解析为 JSON')
    }
  }

  return {
    learningPath: parsed.learningPath || [],
    subQuestions: parsed.subQuestions || [],
    streaming: {
      ...state.streaming,
      currentPhase: 'plan',
      currentStep: `已规划 ${parsed.learningPath?.length || 0} 个学习阶段，${parsed.subQuestions?.length || 0} 个子问题`,
      progress: 10,
      log: [...state.streaming.log, `[Plan] 规划完成: ${parsed.learningPath?.length || 0} 阶段, ${parsed.subQuestions?.length || 0} 子问题`],
    },
  }
}
