/**
 * Pure data definitions for the book's table of contents.
 * No Node.js APIs (fs, path) — safe for both server and client components.
 */

export interface DocItem {
  slug: string
  title: string
  filePath: string
}

export interface DocSection {
  title: string
  items: DocItem[]
}

export const docSections: DocSection[] = [
  {
    title: "开始阅读",
    items: [
      {
        slug: "foreword",
        title: "前言",
        filePath: "content/00-前言.md",
      },
    ],
  },
  {
    title: "Part 1. 基础篇 — 建立心智模型",
    items: [
      {
        slug: "ch01",
        title: "01 · 智能体编程的新范式",
        filePath: "content/第一部分-基础篇/01-智能体编程的新范式.md",
      },
      {
        slug: "ch02",
        title: "02 · 对话循环 — Agent 的心跳",
        filePath: "content/第一部分-基础篇/02-对话循环-Agent的心跳.md",
      },
      {
        slug: "ch03",
        title: "03 · 工具系统 — Agent 的双手",
        filePath: "content/第一部分-基础篇/03-工具系统-Agent的双手.md",
      },
      {
        slug: "ch04",
        title: "04 · 权限管线 — Agent 的护栏",
        filePath: "content/第一部分-基础篇/04-权限管线-Agent的护栏.md",
      },
    ],
  },
  {
    title: "Part 2. 核心系统篇 — 深入子系统",
    items: [
      {
        slug: "ch05",
        title: "05 · 设置与配置 — Agent 的基因",
        filePath: "content/第二部分-核心系统篇/05-设置与配置-Agent的基因.md",
      },
      {
        slug: "ch06",
        title: "06 · 记忆系统 — Agent 的长期记忆",
        filePath: "content/第二部分-核心系统篇/06-记忆系统-Agent的长期记忆.md",
      },
      {
        slug: "ch07",
        title: "07 · 上下文管理 — Agent 的工作记忆",
        filePath: "content/第二部分-核心系统篇/07-上下文管理-Agent的工作记忆.md",
      },
      {
        slug: "ch08",
        title: "08 · 钩子系统 — Agent 的生命周期扩展点",
        filePath: "content/第二部分-核心系统篇/08-钩子系统-Agent的生命周期扩展点.md",
      },
    ],
  },
  {
    title: "Part 3. 高级模式篇 — Agent 的组合与扩展",
    items: [
      {
        slug: "ch09",
        title: "09 · 子智能体与 Fork 模式",
        filePath: "content/第三部分-高级模式篇/09-子智能体与Fork模式.md",
      },
      {
        slug: "ch10",
        title: "10 · 协调器模式 — 多智能体编排",
        filePath: "content/第三部分-高级模式篇/10-协调器模式-多智能体编排.md",
      },
      {
        slug: "ch11",
        title: "11 · 技能系统与插件架构",
        filePath: "content/第三部分-高级模式篇/11-技能系统与插件架构.md",
      },
      {
        slug: "ch12",
        title: "12 · MCP 集成与外部协议",
        filePath: "content/第三部分-高级模式篇/12-MCP集成与外部协议.md",
      },
    ],
  },
  {
    title: "Part 4. 工程实践篇 — 从原理到构建",
    items: [
      {
        slug: "ch13",
        title: "13 · 流式架构与性能优化",
        filePath: "content/第四部分-工程实践篇/13-流式架构与性能优化.md",
      },
      {
        slug: "ch14",
        title: "14 · Plan 模式与结构化工作流",
        filePath: "content/第四部分-工程实践篇/14-Plan模式与结构化工作流.md",
      },
      {
        slug: "ch15",
        title: "15 · 构建你自己的 Agent Harness",
        filePath: "content/第四部分-工程实践篇/15-构建你自己的Agent-Harness.md",
      },
    ],
  },
  {
    title: "附录 — 参考资料速查",
    items: [
      {
        slug: "appendix-a",
        title: "A · 架构导航地图",
        filePath: "content/附录/A-源码导航地图.md",
      },
      {
        slug: "appendix-b",
        title: "B · 工具完整清单",
        filePath: "content/附录/B-工具完整清单.md",
      },
      {
        slug: "appendix-c",
        title: "C · 功能标志速查表",
        filePath: "content/附录/C-功能标志速查表.md",
      },
      {
        slug: "appendix-d",
        title: "D · 术语表",
        filePath: "content/附录/D-术语表.md",
      },
    ],
  },
]
