/**
 * Deep Research Graph — 编排 Plan → Search ↔ Reflect → Synthesize → Save
 *
 * 使用 LangGraph.js 的 StateGraph + Annotation.Root 实现状态图
 *
 * 迁移自 apps/web/lib/deep-research/graph.ts
 * 改动：Annotation 定义新增 userId 字段
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import type { ResearchPhase } from './types.js'
import { planNode } from './nodes/plan.js'
import { searchNode } from './nodes/search.js'
import { reflectNode } from './nodes/reflect.js'
import { synthesizeNode } from './nodes/synthesize.js'
import { saveNode } from './nodes/save.js'

// ─── Annotation 状态定义 ────────────────────────────────────────
const ResearchState = Annotation.Root({
  userQuery: Annotation<string>({
    reducer: (_a: string, b: string) => b,
    default: () => '',
  }),
  projectId: Annotation<string | undefined>({
    reducer: (_a: string | undefined, b: string | undefined) => b,
    default: () => undefined,
  }),
  userId: Annotation<string>({
    reducer: (_a: string, b: string) => b,
    default: () => '',
  }),
  learningPath: Annotation<unknown[]>({
    reducer: (_a: unknown[], b: unknown[]) => b,
    default: () => [],
  }),
  subQuestions: Annotation<unknown[]>({
    reducer: (_a: unknown[], b: unknown[]) => b,
    default: () => [],
  }),
  searchResults: Annotation<unknown[]>({
    reducer: (a: unknown[], b: unknown[]) => [...a, ...b],
    default: () => [],
  }),
  sources: Annotation<unknown[]>({
    reducer: (a: unknown[], b: unknown[]) => [...a, ...b],
    default: () => [],
  }),
  coverage: Annotation<number>({
    reducer: (_a: number, b: number) => b,
    default: () => 0,
  }),
  knowledgeGaps: Annotation<string[]>({
    reducer: (_a: string[], b: string[]) => b,
    default: () => [],
  }),
  isSufficient: Annotation<boolean>({
    reducer: (_a: boolean, b: boolean) => b,
    default: () => false,
  }),
  synthesizedDocs: Annotation<unknown[]>({
    reducer: (_a: unknown[], b: unknown[]) => b,
    default: () => [],
  }),
  savedProjectId: Annotation<string>({
    reducer: (_a: string, b: string) => b,
    default: () => '',
  }),
  savedFileCount: Annotation<number>({
    reducer: (_a: number, b: number) => b,
    default: () => 0,
  }),
  streaming: Annotation<{
    currentPhase: ResearchPhase
    currentStep: string
    progress: number
    log: string[]
  }>({
    reducer: (_a, b) => b,
    default: () => ({
      currentPhase: 'plan' as ResearchPhase,
      currentStep: '',
      progress: 0,
      log: [],
    }),
  }),
  iterationCount: Annotation<number>({
    reducer: (a: number, b: number) => a + b,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_a: number, b: number) => b,
    default: () => 5,
  }),
  apiKey: Annotation<string>({
    reducer: (_a: string, b: string) => b,
    default: () => '',
  }),
  apiBase: Annotation<string>({
    reducer: (_a: string, b: string) => b,
    default: () => '',
  }),
  model: Annotation<string>({
    reducer: (_a: string, b: string) => b,
    default: () => '',
  }),
})

// ─── 条件路由：Reflect 后决定去向 ────────────────────────────────
function shouldContinue(state: typeof ResearchState.State): 'search' | 'synthesize' {
  return state.isSufficient ? 'synthesize' : 'search'
}

// ─── 构建图 ────────────────────────────────────────────────────
export function buildDeepResearchGraph() {
  const graph = new StateGraph(ResearchState)
    .addNode('plan', planNode)
    .addNode('search', searchNode)
    .addNode('reflect', reflectNode)
    .addNode('synthesize', synthesizeNode)
    .addNode('save', saveNode)

  graph
    .addEdge(START, 'plan')
    .addEdge('plan', 'search')
    .addEdge('search', 'reflect')

  // 条件边：reflect 后根据 isSufficient 决定去向
  graph.addConditionalEdges('reflect', shouldContinue, {
    search: 'search',
    synthesize: 'synthesize',
  })

  graph
    .addEdge('synthesize', 'save')
    .addEdge('save', END)

  return graph.compile()
}
