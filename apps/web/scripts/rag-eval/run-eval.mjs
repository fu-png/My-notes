#!/usr/bin/env node
/**
 * RAG 评测脚本
 *
 * 评测维度（参考 RAGAS 框架）：
 * 1. 检索召回率 Context Recall   — 期望的来源文件是否被检索到
 * 2. 检索精确率 Context Precision — 检索到的来源中有多少是相关的
 * 3. 关键词命中 Keyword Hit Rate  — 回答中是否包含期望的关键信息
 * 4. 检索延迟 Retrieval Latency   — 检索响应时间
 *
 * 用法：node scripts/rag-eval/run-eval.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 配置 ──
const BASE_URL = process.env.RAG_EVAL_URL || "http://localhost:3000"
const PROJECT_ID = process.env.RAG_EVAL_PROJECT || "proj-1782444448684"
// Chat 模型配置（用于 query decompose 和 reranker chat fallback）
const CHAT_API_KEY = process.env.RAG_EVAL_CHAT_API_KEY || process.env.RAG_EVAL_API_KEY || "sk-c4hpo0qn10sptp7j8botq4r63vpc766olim876qhdji2fb9l"
const CHAT_API_BASE = process.env.RAG_EVAL_CHAT_API_BASE || process.env.RAG_EVAL_API_BASE || "https://api.xiaomimimo.com/v1"
const CHAT_MODEL = process.env.RAG_EVAL_CHAT_MODEL || "mimo-v2.5-pro"
// Embedding 配置（向量检索 + rerank API）
const EMBEDDING_API_KEY = process.env.RAG_EVAL_EMBEDDING_API_KEY || "sk-nlhsijtvqicguodpqsdddlcbqejbebacvscozuoljqjsciua"
const EMBEDDING_API_BASE = process.env.RAG_EVAL_EMBEDDING_API_BASE || "https://api.siliconflow.cn/v1"
const EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5"

// ── 加载测试用例 ──
const testCases = JSON.parse(readFileSync(resolve(__dirname, "test-cases.json"), "utf-8"))

// ── 评测指标计算 ──

/**
 * Context Recall: 期望的来源文件是否被检索到
 * = |检索到的期望来源| / |全部期望来源|
 */
function calcContextRecall(retrievedSources, expectedSources) {
  if (expectedSources.length === 0) return 1
  const retrievedFilenames = retrievedSources.map((s) =>
    typeof s === "string" ? s : s.filename || s.file || ""
  )
  let hits = 0
  for (const expected of expectedSources) {
    // 模糊匹配：只要检索到的文件名包含期望的文件名前缀即可
    const found = retrievedFilenames.some(
      (r) => r.includes(expected) || expected.includes(r.replace(/^.*\//, ""))
    )
    if (found) hits++
  }
  return hits / expectedSources.length
}

/**
 * Context Precision@K: 前 K 个检索结果中有多少是相关的
 */
function calcContextPrecision(retrievedSources, expectedSources, k = 5) {
  if (retrievedSources.length === 0) return 0
  const topK = retrievedSources.slice(0, k)
  const retrievedFilenames = topK.map((s) =>
    typeof s === "string" ? s : s.filename || s.file || ""
  )
  let relevant = 0
  for (const filename of retrievedFilenames) {
    const isRelevant = expectedSources.some(
      (e) => filename.includes(e) || e.includes(filename.replace(/^.*\//, ""))
    )
    if (isRelevant) relevant++
  }
  return relevant / topK.length
}

/**
 * Keyword Hit Rate: 回答中是否包含期望的关键词
 * = |命中的关键词| / |全部关键词|
 */
function calcKeywordHitRate(contextText, keywords) {
  if (keywords.length === 0) return 1
  let hits = 0
  for (const kw of keywords) {
    if (contextText.toLowerCase().includes(kw.toLowerCase())) hits++
  }
  return hits / keywords.length
}

/**
 * MRR (Mean Reciprocal Rank): 第一个相关来源出现的位置的倒数
 */
function calcMRR(retrievedSources, expectedSources) {
  const retrievedFilenames = retrievedSources.map((s) =>
    typeof s === "string" ? s : s.filename || s.file || ""
  )
  for (let i = 0; i < retrievedFilenames.length; i++) {
    const isRelevant = expectedSources.some(
      (e) =>
        retrievedFilenames[i].includes(e) ||
        e.includes(retrievedFilenames[i].replace(/^.*\//, ""))
    )
    if (isRelevant) return 1 / (i + 1)
  }
  return 0
}

// ── 主评测流程 ──

async function runSingleTest(testCase) {
  const startTime = Date.now()

  try {
    const res = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(PROJECT_ID)}/rag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "query",
        question: testCase.question,
        apiKey: CHAT_API_KEY,
        apiBase: CHAT_API_BASE,
        model: CHAT_MODEL,
        embeddingModel: EMBEDDING_MODEL,
        embeddingApiKey: EMBEDDING_API_KEY,
        embeddingApiBase: EMBEDDING_API_BASE,
      }),
    })

    const latency = Date.now() - startTime

    if (!res.ok) {
      return {
        id: testCase.id,
        success: false,
        error: `HTTP ${res.status}`,
        latency,
      }
    }

    const data = await res.json()
    const context = data.context || {}
    const sources = context.sources || []
    const contextText = context.text || ""

    // 计算各项指标
    const contextRecall = calcContextRecall(sources, testCase.expected_sources)
    const contextPrecisionAt5 = calcContextPrecision(sources, testCase.expected_sources, 5)
    const contextPrecisionAt3 = calcContextPrecision(sources, testCase.expected_sources, 3)
    const keywordHitRate = calcKeywordHitRate(contextText, testCase.keywords)
    const mrr = calcMRR(sources, testCase.expected_sources)

    return {
      id: testCase.id,
      category: testCase.category,
      difficulty: testCase.difficulty,
      question: testCase.question,
      success: true,
      latency,
      totalSources: sources.length,
      totalTokens: context.totalTokens || 0,
      retrievedFiles: sources.map((s) => s.filename || s.file || "unknown").slice(0, 10),
      metrics: {
        contextRecall,
        contextPrecisionAt5,
        contextPrecisionAt3,
        keywordHitRate,
        mrr,
      },
    }
  } catch (err) {
    return {
      id: testCase.id,
      success: false,
      error: err.message,
      latency: Date.now() - startTime,
    }
  }
}

async function runAllTests() {
  console.log("=" .repeat(60))
  console.log("  RAG 评测开始")
  console.log(`  项目: ${PROJECT_ID}`)
  console.log(`  测试用例: ${testCases.length} 个`)
console.log(`  Chat Model: ${CHAT_MODEL} (${CHAT_API_BASE})`)
console.log(`  Embedding: ${EMBEDDING_MODEL} (${EMBEDDING_API_BASE})`)
console.log("=" .repeat(60))
  console.log()

  const results = []

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    process.stdout.write(`[${i + 1}/${testCases.length}] ${tc.id} ${tc.question.slice(0, 30)}... `)

    const result = await runSingleTest(tc)
    results.push(result)

    if (result.success) {
      const m = result.metrics
      console.log(
        `✓ Recall=${(m.contextRecall * 100).toFixed(0)}% ` +
        `P@5=${(m.contextPrecisionAt5 * 100).toFixed(0)}% ` +
        `KW=${(m.keywordHitRate * 100).toFixed(0)}% ` +
        `MRR=${m.mrr.toFixed(2)} ` +
        `${result.latency}ms`
      )
    } else {
      console.log(`✗ ${result.error} (${result.latency}ms)`)
    }

    // 请求间隔，避免 rate limit
    if (i < testCases.length - 1) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return results
}

// ── 报告生成 ──

function generateReport(results) {
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  // 分类汇总
  const categories = {}
  const difficulties = {}

  for (const r of successful) {
    // 按类别
    if (!categories[r.category]) categories[r.category] = []
    categories[r.category].push(r)
    // 按难度
    if (!difficulties[r.difficulty]) difficulties[r.difficulty] = []
    difficulties[r.difficulty].push(r)
  }

  const avg = (arr, key) => {
    if (arr.length === 0) return 0
    return arr.reduce((sum, r) => sum + r.metrics[key], 0) / arr.length
  }

  const avgLatency = (arr) => {
    if (arr.length === 0) return 0
    return arr.reduce((sum, r) => sum + r.latency, 0) / arr.length
  }

  // 总体指标
  const overall = {
    totalTests: results.length,
    successTests: successful.length,
    failedTests: failed.length,
    contextRecall: avg(successful, "contextRecall"),
    contextPrecisionAt5: avg(successful, "contextPrecisionAt5"),
    contextPrecisionAt3: avg(successful, "contextPrecisionAt3"),
    keywordHitRate: avg(successful, "keywordHitRate"),
    mrr: avg(successful, "mrr"),
    avgLatency: avgLatency(successful),
    p50Latency: percentile(successful.map((r) => r.latency), 50),
    p95Latency: percentile(successful.map((r) => r.latency), 95),
  }

  // 分类指标
  const categoryMetrics = {}
  for (const [cat, items] of Object.entries(categories)) {
    categoryMetrics[cat] = {
      count: items.length,
      contextRecall: avg(items, "contextRecall"),
      contextPrecisionAt5: avg(items, "contextPrecisionAt5"),
      keywordHitRate: avg(items, "keywordHitRate"),
      mrr: avg(items, "mrr"),
      avgLatency: avgLatency(items),
    }
  }

  // 难度指标
  const difficultyMetrics = {}
  for (const [diff, items] of Object.entries(difficulties)) {
    difficultyMetrics[diff] = {
      count: items.length,
      contextRecall: avg(items, "contextRecall"),
      contextPrecisionAt5: avg(items, "contextPrecisionAt5"),
      keywordHitRate: avg(items, "keywordHitRate"),
      mrr: avg(items, "mrr"),
      avgLatency: avgLatency(items),
    }
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      projectId: PROJECT_ID,
      embeddingModel: EMBEDDING_MODEL,
      chatModel: CHAT_MODEL,
      baseUrl: BASE_URL,
    },
    overall,
    byCategory: categoryMetrics,
    byDifficulty: difficultyMetrics,
    details: results,
    failedCases: failed,
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function pct(v) {
  return (v * 100).toFixed(1) + "%"
}

function printReport(report) {
  console.log()
  console.log("=" .repeat(60))
  console.log("  RAG 评测报告")
  console.log("=" .repeat(60))
  console.log()

  const o = report.overall
  console.log("─── 总体指标 ───")
  console.log(`  测试用例: ${o.totalTests} (成功 ${o.successTests}, 失败 ${o.failedTests})`)
  console.log()
  console.log(`  Context Recall:       ${pct(o.contextRecall)}    （检索到期望来源文件的比率）`)
  console.log(`  Context Precision@5:  ${pct(o.contextPrecisionAt5)}    （Top-5 结果中相关来源占比）`)
  console.log(`  Context Precision@3:  ${pct(o.contextPrecisionAt3)}    （Top-3 结果中相关来源占比）`)
  console.log(`  Keyword Hit Rate:     ${pct(o.keywordHitRate)}    （关键词命中率）`)
  console.log(`  MRR:                  ${o.mrr.toFixed(3)}    （首个相关结果排名倒数）`)
  console.log()
  console.log(`  平均延迟: ${o.avgLatency.toFixed(0)}ms  |  P50: ${o.p50Latency}ms  |  P95: ${o.p95Latency}ms`)
  console.log()

  console.log("─── 按类别 ───")
  const catLabels = {
    single_file: "单文件查询",
    cross_file: "跨文件查询",
    comparison: "概念对比",
    detail: "细节查询",
  }
  for (const [cat, m] of Object.entries(report.byCategory)) {
    console.log(`  ${catLabels[cat] || cat} (${m.count}题):`)
    console.log(`    Recall=${pct(m.contextRecall)}  P@5=${pct(m.contextPrecisionAt5)}  KW=${pct(m.keywordHitRate)}  MRR=${m.mrr.toFixed(2)}  Latency=${m.avgLatency.toFixed(0)}ms`)
  }
  console.log()

  console.log("─── 按难度 ───")
  const diffLabels = { easy: "简单", medium: "中等", hard: "困难" }
  for (const [diff, m] of Object.entries(report.byDifficulty)) {
    console.log(`  ${diffLabels[diff] || diff} (${m.count}题):`)
    console.log(`    Recall=${pct(m.contextRecall)}  P@5=${pct(m.contextPrecisionAt5)}  KW=${pct(m.keywordHitRate)}  MRR=${m.mrr.toFixed(2)}  Latency=${m.avgLatency.toFixed(0)}ms`)
  }
  console.log()

  // 显示低分用例
  const lowScoreCases = report.details
    .filter((r) => r.success && r.metrics.keywordHitRate < 0.5)
    .map((r) => `  ⚠ ${r.id}: KW=${pct(r.metrics.keywordHitRate)} Recall=${pct(r.metrics.contextRecall)} — "${r.question.slice(0, 40)}..."`)
  if (lowScoreCases.length > 0) {
    console.log("─── 低分用例（关键词命中 < 50%）───")
    console.log(lowScoreCases.join("\n"))
    console.log()
  }

  // 行业基准对照
  console.log("─── 行业基准对照 ───")
  console.log("  指标              本系统    行业良好    行业优秀")
  console.log(`  Context Recall    ${pct(o.contextRecall).padEnd(10)}  ≥80%       ≥90%`)
  console.log(`  Precision@5       ${pct(o.contextPrecisionAt5).padEnd(10)}  ≥60%       ≥80%`)
  console.log(`  Keyword Hit       ${pct(o.keywordHitRate).padEnd(10)}  ≥70%       ≥85%`)
  console.log(`  MRR               ${o.mrr.toFixed(3).padEnd(10)}  ≥0.60      ≥0.80`)
  console.log(`  Avg Latency       ${o.avgLatency.toFixed(0).padEnd(7)}ms  <5000ms    <3000ms`)
  console.log()
}

// ── 主入口 ──

async function main() {
  // 先检查服务是否可用
  try {
    const healthRes = await fetch(`${BASE_URL}`, { signal: AbortSignal.timeout(5000) })
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`)
  } catch {
    console.error(`❌ 无法连接到 ${BASE_URL}，请先启动 dev server`)
    process.exit(1)
  }

  const results = await runAllTests()
  const report = generateReport(results)

  // 打印报告
  printReport(report)

  // 保存完整结果
  const outputDir = resolve(__dirname, "results")
  mkdirSync(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const outputPath = resolve(outputDir, `eval-${timestamp}.json`)
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`📄 完整报告已保存: ${outputPath}`)
}

main().catch((err) => {
  console.error("评测失败:", err)
  process.exit(1)
})
