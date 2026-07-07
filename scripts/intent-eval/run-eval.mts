#!/usr/bin/env -S npx tsx
/**
 * 意图识别高难度评测脚本
 *
 * 直接 import 真实的 lib/agents/supervisor.ts 逻辑（避免逻辑漂移），
 * 对比两条检测路径的准确率：
 *   1. 规则版 detectIntent()         — 零延迟规则快筛
 *   2. LLM 版 detectIntentWithLLM()  — 真实 LLM 调用（与线上一致的 prompt/参数）
 *
 * 测试用例特意设计为高难度对抗性场景（见 test-cases.json 的 note 字段说明），
 * 用于暴露规则匹配的局限性，并验证 LLM 兜底是否能纠正这些误判。
 *
 * 用法：npx tsx scripts/intent-eval/run-eval.mts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import {
  detectIntent,
  detectIntentWithLLM,
  detectIntentSmart,
  type DetectedIntent,
} from "../../lib/agents/supervisor"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 配置（与 rag-eval 保持一致的 fallback，便于免配置直接跑）──
const CHAT_API_KEY =
  process.env.INTENT_EVAL_API_KEY ||
  "sk-c4hpo0qn10sptp7j8botq4r63vpc766olim876qhdji2fb9l"
const CHAT_API_BASE =
  process.env.INTENT_EVAL_API_BASE || "https://api.xiaomimimo.com/v1"
const CHAT_MODEL = process.env.INTENT_EVAL_MODEL || "mimo-v2.5-pro"

interface TestCase {
  id: string
  category: string
  difficulty: "easy" | "medium" | "hard"
  text: string
  expected: Record<string, unknown>
  note: string
  context?: { hasPptSession?: boolean }
}

const testCases: TestCase[] = JSON.parse(
  readFileSync(resolve(__dirname, "test-cases.json"), "utf-8"),
)

// ── 匹配逻辑 ──

/**
 * 只比对 expected 中声明的字段（部分匹配）。
 * 例如 expected 只声明 { type: "chat" } 时，不强制要求 needsRAG 一致。
 */
function isMatch(actual: DetectedIntent, expected: Record<string, unknown>): boolean {
  const actualRecord = actual as unknown as Record<string, unknown>
  for (const key of Object.keys(expected)) {
    if (actualRecord[key] !== expected[key]) return false
  }
  return true
}

function formatIntent(intent: DetectedIntent): string {
  const r = intent as unknown as Record<string, unknown>
  const parts = [`type=${r.type}`]
  if (r.needsRAG !== undefined) parts.push(`needsRAG=${r.needsRAG}`)
  if (r.action !== undefined) parts.push(`action=${r.action}`)
  if (r.query !== undefined) parts.push(`query="${String(r.query).slice(0, 20)}"`)
  return parts.join(" ")
}

// ── 单条用例评测 ──

interface CaseResult {
  id: string
  category: string
  difficulty: string
  text: string
  note: string
  expected: Record<string, unknown>
  rule: { intent: DetectedIntent; pass: boolean; latencyMs: number }
  llm: { intent: DetectedIntent; pass: boolean; latencyMs: number; error?: string }
  smart: { intent: DetectedIntent; pass: boolean; latencyMs: number; error?: string }
}

async function runCase(tc: TestCase): Promise<CaseResult> {
  const context = tc.context

  // 规则版
  const ruleStart = Date.now()
  const ruleIntent = detectIntent(tc.text, context)
  const ruleLatency = Date.now() - ruleStart
  const rulePass = isMatch(ruleIntent, tc.expected)

  // LLM 版（真实调用，与线上参数一致）
  const llmStart = Date.now()
  let llmIntent: DetectedIntent
  let llmError: string | undefined
  try {
    llmIntent = await detectIntentWithLLM(tc.text, {
      ...context,
      apiKey: CHAT_API_KEY,
      apiBase: CHAT_API_BASE,
      model: CHAT_MODEL,
    })
  } catch (err) {
    llmIntent = { type: "chat" }
    llmError = err instanceof Error ? err.message : String(err)
  }
  const llmLatency = Date.now() - llmStart
  const llmPass = isMatch(llmIntent, tc.expected)

  // 级联版（detectIntentSmart，真实线上路径：规则快筛 isRuleDeterminable() 命中则短路，
  // 未命中才走 LLM）。这是唯一能暴露"规则层过度短路"问题的路径——
  // 前两列（纯规则/纯LLM）各自独立调用，无法反映级联门控逻辑的实际行为。
  const smartStart = Date.now()
  let smartIntent: DetectedIntent
  let smartError: string | undefined
  try {
    smartIntent = await detectIntentSmart(tc.text, {
      ...context,
      apiKey: CHAT_API_KEY,
      apiBase: CHAT_API_BASE,
      model: CHAT_MODEL,
    })
  } catch (err) {
    smartIntent = { type: "chat" }
    smartError = err instanceof Error ? err.message : String(err)
  }
  const smartLatency = Date.now() - smartStart
  const smartPass = isMatch(smartIntent, tc.expected)

  return {
    id: tc.id,
    category: tc.category,
    difficulty: tc.difficulty,
    text: tc.text,
    note: tc.note,
    expected: tc.expected,
    rule: { intent: ruleIntent, pass: rulePass, latencyMs: ruleLatency },
    llm: { intent: llmIntent, pass: llmPass, latencyMs: llmLatency, error: llmError },
    smart: { intent: smartIntent, pass: smartPass, latencyMs: smartLatency, error: smartError },
  }
}

// ── 主流程 ──

async function main() {
  console.log("=".repeat(70))
  console.log("  意图识别高难度评测")
  console.log(`  测试用例: ${testCases.length} 个（含对抗性/混合/口语化/边界场景）`)
  console.log(`  LLM: ${CHAT_MODEL} (${CHAT_API_BASE})`)
  console.log("=".repeat(70))
  console.log()

  const results: CaseResult[] = []

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    process.stdout.write(
      `[${i + 1}/${testCases.length}] ${tc.id} (${tc.difficulty}) ${tc.text.slice(0, 24)}... `,
    )
    const result = await runCase(tc)
    results.push(result)

    const ruleMark = result.rule.pass ? "✓" : "✗"
    const llmMark = result.llm.pass ? "✓" : "✗"
    const smartMark = result.smart.pass ? "✓" : "✗"
    console.log(
      `规则${ruleMark}[${formatIntent(result.rule.intent)}] ` +
        `LLM${llmMark}[${formatIntent(result.llm.intent)}] ` +
        `级联${smartMark}[${formatIntent(result.smart.intent)}] ${result.smart.latencyMs}ms`,
    )

    // 请求间隔，避免 rate limit
    if (i < testCases.length - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return results
}

// ── 报告生成 ──

function pct(n: number, total: number): string {
  if (total === 0) return "N/A"
  return ((n / total) * 100).toFixed(1) + "%"
}

function summarize(results: CaseResult[]) {
  const total = results.length
  const ruleCorrect = results.filter((r) => r.rule.pass).length
  const llmCorrect = results.filter((r) => r.llm.pass).length
  const smartCorrect = results.filter((r) => r.smart.pass).length
  const llmErrors = results.filter((r) => r.llm.error).length

  // 按难度
  const byDifficulty: Record<string, { total: number; ruleCorrect: number; llmCorrect: number; smartCorrect: number }> = {}
  for (const r of results) {
    if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, ruleCorrect: 0, llmCorrect: 0, smartCorrect: 0 }
    byDifficulty[r.difficulty].total++
    if (r.rule.pass) byDifficulty[r.difficulty].ruleCorrect++
    if (r.llm.pass) byDifficulty[r.difficulty].llmCorrect++
    if (r.smart.pass) byDifficulty[r.difficulty].smartCorrect++
  }

  // 按类别
  const byCategory: Record<string, { total: number; ruleCorrect: number; llmCorrect: number; smartCorrect: number }> = {}
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, ruleCorrect: 0, llmCorrect: 0, smartCorrect: 0 }
    byCategory[r.category].total++
    if (r.rule.pass) byCategory[r.category].ruleCorrect++
    if (r.llm.pass) byCategory[r.category].llmCorrect++
    if (r.smart.pass) byCategory[r.category].smartCorrect++
  }

  // LLM 修正了规则错误的案例（体现级联价值）
  const llmFixedRuleErrors = results.filter((r) => !r.rule.pass && r.llm.pass)
  // LLM 反而比规则更差的案例（回归风险）
  const llmRegressed = results.filter((r) => r.rule.pass && !r.llm.pass)
  // 两者都错的案例（系统性缺陷）
  const bothWrong = results.filter((r) => !r.rule.pass && !r.llm.pass)
  // 级联版判定错误但纯 LLM 判定正确的案例（说明 isRuleDeterminable 错误短路，拦截了本可由 LLM 纠正的判断）
  const smartWorseThanLlm = results.filter((r) => !r.smart.pass && r.llm.pass)
  // 级联版所有出错案例（真实线上路径会暴露的问题，最贴近用户实际体验）
  const smartWrong = results.filter((r) => !r.smart.pass)

  const avgLatency = (arr: CaseResult[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, r) => s + r.llm.latencyMs, 0) / arr.length

  return {
    timestamp: new Date().toISOString(),
    config: { model: CHAT_MODEL, apiBase: CHAT_API_BASE },
    overall: {
      total,
      ruleAccuracy: ruleCorrect / total,
      llmAccuracy: llmCorrect / total,
      smartAccuracy: smartCorrect / total,
      llmErrorCount: llmErrors,
      avgLlmLatencyMs: avgLatency(results),
    },
    byDifficulty,
    byCategory,
    llmFixedRuleErrors: llmFixedRuleErrors.map((r) => ({
      id: r.id,
      text: r.text,
      expected: r.expected,
      ruleGot: formatIntent(r.rule.intent),
      llmGot: formatIntent(r.llm.intent),
    })),
    llmRegressed: llmRegressed.map((r) => ({
      id: r.id,
      text: r.text,
      expected: r.expected,
      ruleGot: formatIntent(r.rule.intent),
      llmGot: formatIntent(r.llm.intent),
    })),
    bothWrong: bothWrong.map((r) => ({
      id: r.id,
      text: r.text,
      note: r.note,
      expected: r.expected,
      ruleGot: formatIntent(r.rule.intent),
      llmGot: formatIntent(r.llm.intent),
    })),
    smartWorseThanLlm: smartWorseThanLlm.map((r) => ({
      id: r.id,
      text: r.text,
      expected: r.expected,
      smartGot: formatIntent(r.smart.intent),
      llmGot: formatIntent(r.llm.intent),
    })),
    smartWrong: smartWrong.map((r) => ({
      id: r.id,
      text: r.text,
      note: r.note,
      expected: r.expected,
      smartGot: formatIntent(r.smart.intent),
    })),
    details: results,
  }
}

function printReport(report: ReturnType<typeof summarize>) {
  console.log()
  console.log("=".repeat(70))
  console.log("  评测报告")
  console.log("=".repeat(70))
  console.log()

  const o = report.overall
  console.log("─── 总体准确率 ───")
  console.log(`  测试用例总数: ${o.total}`)
  console.log(`  规则版准确率: ${pct(Math.round(o.ruleAccuracy * o.total), o.total)}`)
  console.log(`  LLM 版准确率: ${pct(Math.round(o.llmAccuracy * o.total), o.total)}`)
  console.log(`  级联版准确率: ${pct(Math.round(o.smartAccuracy * o.total), o.total)}（真实线上路径，最具参考价值）`)
  console.log(`  LLM 调用异常: ${o.llmErrorCount} 次`)
  console.log(`  LLM 平均延迟: ${o.avgLlmLatencyMs.toFixed(0)}ms`)
  console.log()

  console.log("─── 按难度 ───")
  const diffLabels: Record<string, string> = { easy: "简单", medium: "中等", hard: "困难" }
  for (const [diff, m] of Object.entries(report.byDifficulty)) {
    console.log(
      `  ${diffLabels[diff] || diff} (${m.total}题): 规则=${pct(m.ruleCorrect, m.total)}  LLM=${pct(m.llmCorrect, m.total)}  级联=${pct(m.smartCorrect, m.total)}`,
    )
  }
  console.log()

  console.log("─── 按类别 ───")
  for (const [cat, m] of Object.entries(report.byCategory)) {
    console.log(
      `  ${cat} (${m.total}题): 规则=${pct(m.ruleCorrect, m.total)}  LLM=${pct(m.llmCorrect, m.total)}  级联=${pct(m.smartCorrect, m.total)}`,
    )
  }
  console.log()

  if (report.llmFixedRuleErrors.length > 0) {
    console.log(`─── LLM 纠正了规则误判（${report.llmFixedRuleErrors.length}例，体现级联价值）───`)
    for (const c of report.llmFixedRuleErrors) {
      console.log(`  ✓ ${c.id}: "${c.text.slice(0, 30)}"`)
      console.log(`      期望=${JSON.stringify(c.expected)}  规则=${c.ruleGot}  LLM=${c.llmGot}`)
    }
    console.log()
  }

  if (report.llmRegressed.length > 0) {
    console.log(`─── ⚠ LLM 反而比规则更差（${report.llmRegressed.length}例，回归风险）───`)
    for (const c of report.llmRegressed) {
      console.log(`  ✗ ${c.id}: "${c.text.slice(0, 30)}"`)
      console.log(`      期望=${JSON.stringify(c.expected)}  规则=${c.ruleGot}  LLM=${c.llmGot}`)
    }
    console.log()
  }

  if (report.bothWrong.length > 0) {
    console.log(`─── ⚠⚠ 规则+LLM 均误判（${report.bothWrong.length}例，系统性缺陷）───`)
    for (const c of report.bothWrong) {
      console.log(`  ✗✗ ${c.id}: "${c.text.slice(0, 40)}"`)
      console.log(`      说明: ${c.note}`)
      console.log(`      期望=${JSON.stringify(c.expected)}  规则=${c.ruleGot}  LLM=${c.llmGot}`)
    }
    console.log()
  }

  if (report.smartWorseThanLlm.length > 0) {
    console.log(`─── ⚠ isRuleDeterminable 误短路（${report.smartWorseThanLlm.length}例，拦截了本可由LLM纠正的判断）───`)
    for (const c of report.smartWorseThanLlm) {
      console.log(`  ✗ ${c.id}: "${c.text.slice(0, 40)}"`)
      console.log(`      期望=${JSON.stringify(c.expected)}  级联=${c.smartGot}  纯LLM=${c.llmGot}`)
    }
    console.log()
  }

  if (report.smartWrong.length > 0) {
    console.log(`─── 级联版（真实线上路径）全部误判案例（${report.smartWrong.length}例）───`)
    for (const c of report.smartWrong) {
      console.log(`  ✗ ${c.id}: "${c.text.slice(0, 40)}"`)
      console.log(`      期望=${JSON.stringify(c.expected)}  级联=${c.smartGot}`)
    }
    console.log()
  }
}

// ── 入口 ──

async function run() {
  const results = await main()
  const report = summarize(results)
  printReport(report)

  const outputDir = resolve(__dirname, "results")
  mkdirSync(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const outputPath = resolve(outputDir, `eval-${timestamp}.json`)
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`📄 完整报告已保存: ${outputPath}`)
}

run().catch((err) => {
  console.error("评测失败:", err)
  process.exit(1)
})
