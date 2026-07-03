"use client"

import * as React from "react"
import {
  IconTrash,
  IconLoader2,
  IconX,
  IconCheck,
  IconSparkles,
  IconLayoutSidebarRightCollapse,
  IconPlus,
  IconHistory,
  IconArrowLeft,
  IconMessage,
  IconDatabase,
  IconQuote,
  IconCopy,
  IconDownload,
  IconPlayerPlay,
  IconPlayerStop,
  IconMicrophone,
  IconRefresh,
  IconChevronRight,
  IconChevronDown,
  IconFileText,
  IconSearch,
  IconSend,
  IconWorld,
  IconBrain,
  IconPresentation,
  IconAlertCircle,
  IconEye,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import dynamic from "next/dynamic"
import { Switch } from "@/components/ui/switch"
import type { ProviderInfo } from "@/components/settings-dialog"
import type { ChatMessage, Conversation, DocFile, PptOutline } from "./types"
import { GENERATE_TEMPLATES, PPT_STYLE_PRESETS } from "./types"

const MarkdownRenderer = dynamic(() => import("@/components/markdown-renderer").then(mod => ({ default: mod.MarkdownRenderer })), {
  loading: () => <div className="animate-pulse h-4 w-full bg-muted rounded" />,
})

// ─── Props ───

export interface ChatPanelProps {
  projectName: string
  projectId: string
  files: DocFile[]
  activeFile: string | null
  fileContent: string

  // Chat state
  chatMessages: ChatMessage[]
  chatInput: string
  chatLoading: boolean
  chatModel: string
  providerList: ProviderInfo[]
  onSwitchProvider: (providerId: string) => void
  deepThinkMode: boolean

  // Conversation history
  conversations: Conversation[]
  activeConversationId: string | null
  showHistory: boolean

  // AI config
  aiConfigured: boolean
  showAI: boolean

  // RAG
  ragEnabled: boolean
  indexStatus: {
    indexed: boolean
    lastIndexedAt?: string
    totalChunks?: number
    totalFiles?: number
  } | null
  indexing: boolean
  indexProgress: string
  showSources: boolean
  sourcesData: {
    files: { filename: string; fileTitle: string; chunkCount: number; totalTokens: number; headings: string[] }[]
    totalChunks: number
    totalTokens: number
  } | null
  sourcesLoading: boolean

  // AI generation
  generating: boolean

  // Audio
  audioGenerating: boolean
  audioPlaying: boolean

  // Panel resize
  aiPanelWidth: number
  aiPanelRef: React.RefObject<HTMLDivElement | null>
  chatScrollRef: React.RefObject<HTMLDivElement | null>
  chatEndRef: React.RefObject<HTMLDivElement | null>

  // Event handlers
  onResizeStart: (e: React.MouseEvent) => void
  onSetShowHistory: (v: boolean) => void
  onSetShowAI: (v: boolean) => void
  onSetShowSources: (v: boolean | ((v: boolean) => boolean)) => void
  onSetChatInput: (v: string) => void
  onSendMessage: () => void
  onStopGeneration: () => void
  onToggleDeepThink: () => void
  selectedText: string
  onClearSelectedText: () => void
  onStartNewConversation: () => void
  onLoadConversation: (conv: Conversation) => void
  onDeleteConversation: (convId: string) => void
  onFetchSourcesData: () => void
  onChatScroll: () => void
  onBuildIndex: () => void

  // Generation handlers
  onGenerate: (type: string) => void
  onSaveGenerated: (msgId: string) => void
  onCopyGenerated: (msgId: string) => void
  onRegenerateGuide: (type: string) => void
  onRegenerateChat: (msgId: string) => void

  // Doc update handlers
  onApplyDocUpdate: (msgId: string) => void
  onRejectDocUpdate: (msgId: string) => void

  // Audio handlers
  onAudioGenerate: () => void
  onAudioConfirm: (msgId: string) => void
  onAudioPlay: (msgId: string) => void
  onAudioStop: () => void

  // PPT generation
  pptSession: {
    active: boolean
    step: string
    stylePreset: string
    slideCount: number
    customPrompt: string
    userIntent: string
    outlineMsgId: string | null
    imagesMsgId: string | null
  } | null
  onPptStyleSelect: (styleId: string) => void
  onPptSlideCountSelect: (count: number) => void
  onPptStartOutline: (customPrompt: string) => void
  onPptConfirmOutline: (outline: PptOutline) => void
  onPptRetrySlide: (msgId: string, slideIndex: number) => void
  onPptRegenerateOutline: () => void
onPptGuideClick: () => void
}

// ─── Component ───

export const ChatPanel = React.memo(function ChatPanel({
  projectName,
  projectId,
  files,
  chatMessages,
  chatInput,
  chatLoading,
  chatModel,
  providerList,
  onSwitchProvider,
  deepThinkMode,
  conversations,
  activeConversationId,
  showHistory,
  aiConfigured,
  showAI,
  ragEnabled,
  indexStatus,
  indexing,
  indexProgress,
  showSources,
  sourcesData,
  sourcesLoading,
  generating,
  audioGenerating,
  audioPlaying,
  aiPanelWidth,
  aiPanelRef,
  chatScrollRef,
  chatEndRef,
  onResizeStart,
  onSetShowHistory,
  onSetShowAI,
  onSetShowSources,
  onSetChatInput,
  onSendMessage,
  onStopGeneration,
  onToggleDeepThink,
  selectedText,
  onClearSelectedText,
  onStartNewConversation,
  onLoadConversation,
  onDeleteConversation,
  onFetchSourcesData,
  onChatScroll,
  onBuildIndex,
  onGenerate,
  onSaveGenerated,
  onCopyGenerated,
  onRegenerateGuide,
  onRegenerateChat,
  onApplyDocUpdate,
  onRejectDocUpdate,
  onAudioGenerate,
  onAudioConfirm,
  onAudioPlay,
  onAudioStop,
  pptSession,
  onPptStyleSelect,
  onPptSlideCountSelect,
  onPptStartOutline,
  onPptConfirmOutline,
  onPptRetrySlide,
  onPptRegenerateOutline,
  onPptGuideClick,
}: ChatPanelProps) {
  if (!showAI) return null

  return (
    <div ref={aiPanelRef} className="relative hidden shrink-0 flex-col overflow-hidden border-l bg-background md:flex" style={{ width: aiPanelWidth }}>
      {/* Resize handle */}
      <div
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
        onMouseDown={onResizeStart}
      />
      {/* Chat header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          {showHistory ? (
            <>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onSetShowHistory(false)} aria-label="返回">
                <IconArrowLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium">历史对话</span>
            </>
          ) : (
            <>
              <IconSparkles className="size-4 text-primary" />
              <span className="text-sm font-medium">AI 助手</span>
              <span className={`size-1.5 rounded-full ${aiConfigured ? "bg-green-500" : "bg-muted-foreground/40"}`} title={aiConfigured ? "已配置" : "未配置 API Key"} />
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!showHistory && (
            <>
              {indexStatus?.indexed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`size-7 ${showSources ? "text-primary" : ""}`}
                      onClick={() => {
                        if (!showSources && !sourcesData) onFetchSourcesData()
                        onSetShowSources((v: boolean) => !v)
                      }}
                      aria-label="来源管理"
                    >
                      <IconDatabase className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">来源管理</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={onStartNewConversation} aria-label="新对话">
                    <IconPlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新对话</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onSetShowHistory(true)} aria-label="历史对话">
                    <IconHistory className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">历史对话</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onSetShowAI(false)} aria-label="收起">
                <IconLayoutSidebarRightCollapse className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">收起</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Sources panel */}
      {showSources ? (
        <SourcesPanel
          sourcesLoading={sourcesLoading}
          sourcesData={sourcesData}
          indexStatus={indexStatus}
          onClose={() => onSetShowSources(false)}
        />
      ) : showHistory ? (
        <HistoryPanel
          conversations={conversations}
          activeConversationId={activeConversationId}
          onLoad={onLoadConversation}
          onDelete={onDeleteConversation}
        />
      ) : (
      <>
      {/* Scrollable content area */}
      <div ref={chatScrollRef} onScroll={onChatScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className={`p-4 ${chatMessages.length <= 1 && !chatLoading ? "flex h-full flex-col" : ""}`}>
          {/* Welcome & greeting (when no conversation) */}
          {chatMessages.length <= 1 && !chatLoading ? (
            <div className="flex flex-1 flex-col">
              {/* Centered greeting */}
              <div className="flex flex-1 flex-col items-center justify-center px-4">
                <div className="mb-1 flex size-9 items-center justify-center bg-primary/10">
                  <IconSparkles className="size-4 text-primary" />
                </div>
                <h3 className="text-[15px] font-medium">有什么可以帮你？</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {projectName}
                </p>
              </div>

              {/* RAG index status hint */}
              {files.length > 0 && !indexStatus?.indexed && !indexing && (
                <div className="mb-3 flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-50/50 px-3 py-2 dark:bg-amber-950/20">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400">
                    <IconAlertCircle className="size-3.5 shrink-0" />
                    <span className="truncate">未建立知识索引，AI 仅基于当前文件回答</span>
                  </div>
                  <button
                    onClick={onBuildIndex}
                    className="shrink-0 text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                  >
                    建索引
                  </button>
                </div>
              )}
              {indexing && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary/80">
                  <IconLoader2 className="size-3.5 shrink-0 animate-spin" />
                  <span className="truncate">{indexProgress || "正在构建知识索引..."}</span>
                </div>
              )}

              {/* 笔记本指南 — AI 生成模板 */}
              {files.length > 0 && (
                <div className="space-y-1.5 pb-3">
                  <p className="px-1 text-[11px] text-muted-foreground/70">笔记本指南</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {GENERATE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.type}
                        className="flex items-center gap-2 border border-border px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-muted/50 disabled:opacity-50"
                        onClick={() => onGenerate(tpl.type)}
                        disabled={generating}
                      >
                        <tpl.icon className="size-3.5 shrink-0 text-primary/70" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{tpl.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{tpl.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* 音频概述按钮 */}
                  <button
                    className="flex w-full items-center gap-2.5 border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-primary/10 disabled:opacity-50"
                    onClick={onAudioGenerate}
                    disabled={audioGenerating}
                  >
                    <IconPlayerPlay className="size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">音频概述</p>
                      <p className="text-[11px] text-muted-foreground">生成 Podcast 风格双人对话，边听边学</p>
                    </div>
                    {audioGenerating && <IconLoader2 className="size-3.5 shrink-0 animate-spin text-primary" />}
                  </button>
                  {/* AI 生成 PPT 按钮 */}
                  <button
                    className="flex w-full items-center gap-2.5 border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-primary/10 disabled:opacity-50"
                    onClick={() => onPptGuideClick()}
                    disabled={generating}
                  >
                    <IconPresentation className="size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">AI 生成 PPT</p>
                      <p className="text-[11px] text-muted-foreground">基于笔记内容生成演示文稿幻灯片</p>
                    </div>
                  </button>
                </div>
              )}

              {/* PPT Generator Dialog - moved to bottom for both views */}
            </div>
          ) : (
            /* Chat messages */
            <div className="space-y-3">
              {chatMessages.slice(1).map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
{msg.role === "user" ? (
<div className="max-w-[85%] rounded-lg bg-primary text-primary-foreground">
  {msg.quotedText && (
    <div className="rounded-t-lg border-b border-primary-foreground/20 bg-primary-foreground/15 px-3 py-2">
      <div className="mb-1 flex items-center gap-1">
        <IconQuote className="size-3 text-primary-foreground/60" />
        <span className="text-[10px] font-semibold tracking-wide text-primary-foreground/60">引用划词</span>
      </div>
      <p className="line-clamp-4 border-l-2 border-primary-foreground/30 pl-2 text-[11px] italic leading-relaxed text-primary-foreground/90">{msg.quotedText}</p>
    </div>
  )}
  <div className="px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
    {msg.content}
  </div>
</div>
                  ) : (
                    <div className="w-full overflow-hidden text-[13px] leading-relaxed [&_article]:max-w-none [&_article]:text-[13px] [&_article]:leading-relaxed [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:text-xs [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:text-xs [&_blockquote]:my-2 [&_blockquote]:text-[13px] [&_hr]:my-3 [&_table]:text-xs [&_img]:max-w-full">
                      {/* 深度思考推理过程 */}
                      {msg.reasoning && (
                        <ReasoningBlock
                          reasoning={msg.reasoning}
                          isThinking={chatLoading && msg.id === chatMessages[chatMessages.length - 1]?.id}
                          defaultOpen={chatLoading && msg.id === chatMessages[chatMessages.length - 1]?.id || !msg.content}
                        />
                      )}
                      {!msg.content && !msg.reasoning && chatLoading && !msg.audioMeta ? (
                        <div className="px-1 py-2">
                          <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : msg.content ? (
                        <MarkdownRenderer content={msg.content} />
                      ) : null}
                      {/* RAG 引用来源 */}
                      {msg.ragSources && msg.ragSources.length > 0 && (
                        <details className="mt-2 border border-border/50 bg-muted/30 text-xs">
                          <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground">
                            <IconQuote className="size-3" />
                            引用了 {msg.ragSources.length} 个来源
                          </summary>
                          <div className="space-y-1 border-t px-2.5 py-2">
                            {msg.ragSources.map((src, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
                                <span className="mt-px shrink-0 font-mono text-[10px] text-primary/70">[{i + 1}]</span>
                                <div className="min-w-0">
                                  <span className="font-medium text-foreground/80">{src.fileTitle}</span>
                                  {src.headingPath.length > 0 && (
                                    <span className="text-muted-foreground/70"> &gt; {src.headingPath.join(" > ")}</span>
                                  )}
                                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">{src.snippet}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {/* 互联网搜索来源 (Agent Reach) */}
                      {msg.webSources && msg.webSources.length > 0 && (
                        <details className="mt-2 border border-border/50 bg-blue-50/50 dark:bg-blue-950/20 text-xs" open={msg.webSources.length <= 3}>
                          <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground">
                            <IconWorld className="size-3 text-blue-500" />
                            {msg.webSources[0].action === "search"
                              ? `搜索「${msg.webSources[0].query}」· ${msg.webSources.length} 条结果`
                              : msg.webSources[0].action === "web" ? "网页内容"
                              : msg.webSources[0].action === "youtube" ? "YouTube 视频"
                              : msg.webSources[0].action === "github" ? "GitHub"
                              : msg.webSources[0].action === "bilibili" ? "B站"
                              : "互联网内容"}
                          </summary>
                          <div className="space-y-1.5 border-t px-2.5 py-2">
                            {msg.webSources.map((src, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
                                <span className="mt-px shrink-0 font-mono text-[10px] text-blue-500/70">[{i + 1}]</span>
                                <div className="min-w-0">
                                  {src.url ? (
                                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all text-[11px] font-medium">
                                      {src.snippet || src.url}
                                    </a>
                                  ) : (
                                    <span className="text-[11px] font-medium text-foreground/80">{src.snippet}</span>
                                  )}
                                  {src.url && src.snippet && src.snippet !== src.url && (
                                    <p className="mt-0.5 text-[10px] text-muted-foreground/50 truncate">{src.url}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {/* Doc update confirmation buttons */}
                      {msg.docUpdate && (
                        <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                          {msg.docUpdate.status === "pending" && (
                            <>
                              <span className="flex-1 text-xs text-muted-foreground">AI 建议修改文档内容</span>
                              <Button
                                size="sm"
                                className="h-6 gap-1 text-xs"
                                onClick={() => onApplyDocUpdate(msg.id)}
                              >
                                <IconCheck className="size-3" />
                                应用
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 text-xs"
                                onClick={() => onRejectDocUpdate(msg.id)}
                              >
                                <IconX className="size-3" />
                                退回
                              </Button>
                            </>
                          )}
                          {msg.docUpdate.status === "applied" && (
                            <span className="text-xs text-green-600">✅ 已应用到文档</span>
                          )}
                          {msg.docUpdate.status === "rejected" && (
                            <span className="text-xs text-muted-foreground">已退回</span>
                          )}
                        </div>
                      )}
                      {/* 音频概述控件 */}
                      {msg.audioMeta && (
                        <AudioControls
                          msg={msg}
                          audioGenerating={audioGenerating}
                          audioPlaying={audioPlaying}
                          onConfirm={onAudioConfirm}
                          onPlay={onAudioPlay}
                          onStop={onAudioStop}
                        />
                      )}
                      {/* PPT 生成交互控件 */}
                      {msg.pptMeta && (
<PptFlowControls
  msg={msg}
  projectId={projectId}
  pptSession={pptSession}
                          chatLoading={chatLoading}
                          onStyleSelect={onPptStyleSelect}
                          onSlideCountSelect={onPptSlideCountSelect}
                          onStartOutline={onPptStartOutline}
                          onConfirmOutline={onPptConfirmOutline}
                          onRetrySlide={onPptRetrySlide}
                          onRegenerateOutline={onPptRegenerateOutline}
                        />
                      )}
                      {/* AI 回复操作按钮 */}
                      {msg.content && !msg.content.startsWith("⚠️") && !msg.audioMeta && !msg.pptMeta && !(msg.generateMeta && !msg.generateMeta.done) && !(chatLoading && msg.id === chatMessages[chatMessages.length - 1]?.id) && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[11px]"
                            onClick={() => onCopyGenerated(msg.id)}
                          >
                            <IconCopy className="size-3" />
                            复制
                          </Button>
                          {msg.generateMeta && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[11px]"
                            onClick={() => onSaveGenerated(msg.id)}
                          >
                            <IconDownload className="size-3" />
                            保存为笔记
                          </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[11px]"
                            onClick={() => msg.generateMeta ? onRegenerateGuide(msg.generateMeta.type) : onRegenerateChat(msg.id)}
                            disabled={chatLoading || generating}
                          >
                            <IconRefresh className="size-3" />
                            重新生成
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Index progress bar */}
      {indexing && indexProgress && (
        <div className="shrink-0 border-t bg-muted/30 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <IconLoader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            <span className="truncate text-[11px] text-muted-foreground">{indexProgress}</span>
          </div>
        </div>
      )}

      {/* 划词引用条 */}
      {selectedText && (
        <div className="shrink-0 border-t bg-primary/5 px-3 py-2">
          <div className="flex items-start gap-2">
            <IconQuote className="size-3.5 shrink-0 mt-0.5 text-primary/60" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-primary/70">划词内容</p>
              <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                {selectedText}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearSelectedText}
              className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom input area */}
      <div className="shrink-0 border-t px-3 py-2.5">
        <div className="border border-border bg-background px-3 py-2">
          <textarea
            value={chatInput}
            onChange={(e) => onSetChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (!chatLoading) onSendMessage()
              }
            }}
            placeholder="输入问题，按 Enter 发送..."
            aria-label="输入消息"
            rows={2}
            className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <IconBrain className={`size-3 ${deepThinkMode ? "text-primary" : "text-muted-foreground/70"}`} />
                    <Switch
                      size="sm"
                      checked={deepThinkMode}
                      onCheckedChange={onToggleDeepThink}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {deepThinkMode ? "深度思考已开启，点击关闭" : "开启深度思考模式"}
                </TooltipContent>
              </Tooltip>
              <span className="ml-2 text-[11px] text-muted-foreground/70">
                {providerList.length > 1 ? (
                  <ModelSwitcher
                    model={chatModel}
                    providers={providerList}
                    onSwitch={onSwitchProvider}
                  />
                ) : (
                  <>{chatModel}{ragEnabled && indexStatus?.indexed ? " · RAG" : ""}</>
                )}
              </span>
            </div>
            {chatLoading || generating ? (
              <button
                className="flex size-6 items-center justify-center rounded-md bg-muted transition-colors hover:bg-muted-foreground/20"
                onClick={onStopGeneration}
                title="停止生成"
                aria-label="停止生成"
              >
                <span className="block size-2.5 rounded-[2px] bg-foreground" />
              </button>
            ) : (
              <Button
                size="icon"
                className="size-6"
                onClick={onSendMessage}
                disabled={!chatInput.trim()}
                aria-label="发送消息"
              >
                <IconSend className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
})

// ─── Sub-components ───

function ReasoningBlock({
  reasoning,
  isThinking,
  defaultOpen,
}: {
  reasoning: string
  isThinking: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const wasThinkingRef = React.useRef(isThinking)

  React.useEffect(() => {
    if (defaultOpen) queueMicrotask(() => setOpen(true))
  }, [defaultOpen])

  // 回答完成后自动收起思考过程
  React.useEffect(() => {
    if (wasThinkingRef.current && !isThinking) {
      setOpen(false)
    }
    wasThinkingRef.current = isThinking
  }, [isThinking])

  return (
    <div className="mb-2 rounded-md border border-primary/20 bg-primary/5 text-xs">
      <button
        className="flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-primary/80 hover:text-primary"
        onClick={() => !isThinking && setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5">
          <IconBrain className={`size-3 ${isThinking ? "animate-pulse" : ""}`} />
          {isThinking ? (
            <span className="flex items-center gap-1">
              正在思考
              <span className="inline-flex gap-0.5">
                <span className="size-1 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
                <span className="size-1 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
                <span className="size-1 rounded-full bg-primary/60 animate-bounce" />
              </span>
            </span>
          ) : (
            "思考过程"
          )}
        </span>
        {!isThinking && (
          <IconChevronDown className={`size-3.5 text-primary/50 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && (
        <div className="border-t border-primary/10 px-2.5 py-2 text-muted-foreground [&_p]:my-1 [&_p]:leading-relaxed">
          <MarkdownRenderer content={reasoning} />
        </div>
      )}
    </div>
  )
}

function ModelSwitcher({
  model,
  providers,
  onSwitch,
}: {
  model: string
  providers: { id: string; model: string; isActive: boolean }[]
  onSwitch: (id: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        {model}
        <IconChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[160px] rounded-md border bg-background py-1 shadow-lg">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSwitch(p.id); setOpen(false) }}
              className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-muted ${
                p.isActive ? "text-primary font-medium" : "text-foreground"
              }`}
            >
              <span className="truncate">{p.model}</span>
              {p.isActive && <IconCheck className="size-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SourcesPanel = React.memo(function SourcesPanel({
  sourcesLoading,
  sourcesData,
  indexStatus,
  onClose,
}: {
  sourcesLoading: boolean
  sourcesData: ChatPanelProps["sourcesData"]
  indexStatus: ChatPanelProps["indexStatus"]
  onClose: () => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">来源管理</h4>
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="关闭来源管理">
            <IconX className="size-3.5" />
          </Button>
        </div>
        {sourcesLoading ? (
          <div className="flex items-center justify-center py-12">
            <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : sourcesData ? (
          <>
            <div className="mb-3 flex gap-3 text-[11px] text-muted-foreground">
              <span>{sourcesData.files.length} 个文件</span>
              <span>{sourcesData.totalChunks} 个文本块</span>
              <span>~{Math.round(sourcesData.totalTokens / 1000)}k tokens</span>
            </div>
            <div className="space-y-1.5">
              {sourcesData.files.map((file) => (
                <Collapsible key={file.filename}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50">
                    <IconFileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.fileTitle}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {file.chunkCount} 块 · ~{Math.round(file.totalTokens / 1000)}k tokens
                      </p>
                    </div>
                    <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-x border-b bg-muted/20 px-3 py-2">
                      {file.headings.length > 0 ? (
                        <div className="space-y-0.5">
                          {file.headings.slice(0, 8).map((h, i) => (
                            <p key={i} className="truncate text-[11px] text-muted-foreground">{h}</p>
                          ))}
                          {file.headings.length > 8 && (
                            <p className="text-[11px] text-muted-foreground/50">...还有 {file.headings.length - 8} 个标题</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">无标题结构</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
            {indexStatus?.lastIndexedAt && (
              <p className="mt-3 text-[11px] text-muted-foreground/60">
                上次索引: {new Date(indexStatus.lastIndexedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <IconDatabase className="mb-2 size-8 opacity-30" />
            <p className="text-sm">尚未建立索引</p>
          </div>
        )}
      </div>
    </div>
  )
})

function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffHours / 24

  if (diffHours < 24) return "今天"
  if (diffHours < 48) return "昨天"
  if (diffDays < 7) return "本周"
  if (diffDays < 30) return "本月"
  return "更早"
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="bg-yellow-200/60 dark:bg-yellow-900/40">{part}</span>
        ) : (
          part
        )
      )}
    </>
  )
}

const HistoryPanel = React.memo(function HistoryPanel({
  conversations,
  activeConversationId,
  onLoad,
  onDelete,
}: {
  conversations: Conversation[]
  activeConversationId: string | null
  onLoad: (conv: Conversation) => void
  onDelete: (convId: string) => void
}) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const filteredConversations = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((conv) => {
      if (conv.title.toLowerCase().includes(q)) return true
      return conv.messages.some((m) => m.content.toLowerCase().includes(q))
    })
  }, [conversations, searchQuery])

  const grouped = React.useMemo(() => {
    const groups: Record<string, Conversation[]> = {}
    for (const conv of filteredConversations) {
      const group = getTimeGroup(conv.updatedAt)
      if (!groups[group]) groups[group] = []
      groups[group].push(conv)
    }
    return groups
  }, [filteredConversations])

  const groupOrder = ["今天", "昨天", "本周", "本月", "更早"]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Search box */}
      <div className="border-b px-3 pb-2 pt-3">
        <div className="relative">
          <IconSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索历史对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="搜索历史对话"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="p-3">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <IconMessage className="mb-2 size-8 opacity-30" />
            <p className="text-sm">暂无历史对话</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <IconSearch className="mb-2 size-8 text-muted-foreground/70" />
            <p className="text-sm text-muted-foreground">没有找到匹配的历史对话</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupOrder.map((groupName) => {
              const groupConvs = grouped[groupName]
              if (!groupConvs || groupConvs.length === 0) return null
              const isCollapsed = collapsedGroups.has(groupName)
              return (
                <div key={groupName}>
                  <button
                    className="mb-1.5 flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    onClick={() => toggleGroup(groupName)}
                  >
                    <IconChevronDown className={`size-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <span>{groupName}</span>
                    <span className="text-muted-foreground">({groupConvs.length})</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-1.5">
                      {groupConvs.map((conv) => (
                        <div
                          key={conv.id}
                          className={`group flex items-center gap-2 border px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${conv.id === activeConversationId ? "border-primary/30 bg-primary/5" : "border-border"}`}
                        >
                          <button
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => onLoad(conv)}
                            aria-label={`打开对话「${conv.title}」`}
                          >
                            <IconMessage className="size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                <HighlightText text={conv.title} query={searchQuery} />
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(conv.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(conv.id) }}
                            aria-label={`删除对话「${conv.title}」`}
                          >
                            <IconTrash className="size-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除对话</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，确定要删除这条对话记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget)
                setDeleteTarget(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})

function AudioControls({
  msg,
  audioGenerating,
  audioPlaying,
  onConfirm,
  onPlay,
  onStop,
}: {
  msg: ChatMessage
  audioGenerating: boolean
  audioPlaying: boolean
  onConfirm: (msgId: string) => void
  onPlay: (msgId: string) => void
  onStop: () => void
}) {
  if (!msg.audioMeta) return null

  return (
    <div className="mt-2 border border-border/50 bg-muted/20 p-2.5 space-y-2">
      {/* 脚本生成中 */}
      {msg.audioMeta.stage === "script" && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <IconLoader2 className="size-3.5 animate-spin shrink-0" />
          {msg.audioMeta.progress || "正在生成对话脚本..."}
        </div>
      )}
      {/* 确认阶段 */}
      {msg.audioMeta.stage === "confirming" && (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1.5 text-[12px]"
            onClick={() => onConfirm(msg.id)}
            disabled={audioGenerating}
          >
            <IconMicrophone className="size-3.5" />
            生成音频
          </Button>
        </div>
      )}
      {/* TTS 合成中 */}
      {msg.audioMeta.stage === "synthesizing" && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <IconLoader2 className="size-3.5 animate-spin shrink-0" />
          {msg.audioMeta.progress || "正在合成语音..."}
        </div>
      )}
      {/* 完成 — 播放控制 */}
      {msg.audioMeta.stage === "done" && (
        <div className="flex items-center gap-1.5">
          <Button
            variant={audioPlaying ? "destructive" : "default"}
            size="sm"
            className="h-7 gap-1.5 text-[12px]"
            onClick={() => onPlay(msg.id)}
          >
            {audioPlaying ? (
              <><IconPlayerStop className="size-3.5" />暂停</>
            ) : (
              <><IconPlayerPlay className="size-3.5" />播放音频</>
            )}
          </Button>
          {audioPlaying && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[12px]"
              onClick={onStop}
            >
              停止
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground ml-1">
            {msg.audioMeta.progress}
          </span>
        </div>
      )}
      {/* 错误 */}
      {msg.audioMeta.stage === "error" && msg.audioMeta.progress && (
        <p className="text-[12px] text-destructive">{msg.audioMeta.progress}</p>
      )}
    </div>
  )
}

// ─── PPT Conversational Flow Controls ───

// Step ordering for determining if a step is already past
const PPT_STEP_ORDER = ["style-select", "slide-count", "custom-prompt", "generating-outline", "outline-review", "generating-images", "done"] as const
function isPastStep(msgStep: string, currentStep: string | undefined): boolean {
  if (!currentStep) return false
  const msgIdx = PPT_STEP_ORDER.indexOf(msgStep as typeof PPT_STEP_ORDER[number])
  const curIdx = PPT_STEP_ORDER.indexOf(currentStep as typeof PPT_STEP_ORDER[number])
  return msgIdx >= 0 && curIdx >= 0 && curIdx > msgIdx
}

function PptFlowControls({
  msg,
  projectId,
  pptSession,
  chatLoading,
  onStyleSelect,
  onSlideCountSelect,
  onStartOutline,
  onConfirmOutline,
  onRetrySlide,
  onRegenerateOutline,
}: {
  msg: ChatMessage
  projectId: string
  pptSession: ChatPanelProps["pptSession"]
  chatLoading: boolean
  onStyleSelect: (styleId: string) => void
  onSlideCountSelect: (count: number) => void
  onStartOutline: (customPrompt: string) => void
  onConfirmOutline: (outline: PptOutline) => void
  onRetrySlide: (msgId: string, slideIndex: number) => void
  onRegenerateOutline: () => void
}) {
  const meta = msg.pptMeta!
  const [customPromptText, setCustomPromptText] = React.useState("")
  const [editedOutline, setEditedOutline] = React.useState<PptOutline | null>(null)
  const [showNotesForSlide] = React.useState<number | null>(null)
  const [showCustomCount, setShowCustomCount] = React.useState(false)
  const customCountRef = React.useRef<HTMLInputElement>(null)
  const [previewMode, setPreviewMode] = React.useState<"none" | "single" | "all">("none")
  const [previewIndex, setPreviewIndex] = React.useState(0)
  const [downloading, setDownloading] = React.useState<"none" | "zip" | "pdf">("none")

  // Sync edited outline only when meta.outline itself changes (e.g. new outline from server)
  const outlineJson = meta.outline ? JSON.stringify(meta.outline) : null
  const prevOutlineJsonRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (outlineJson && outlineJson !== prevOutlineJsonRef.current) {
      prevOutlineJsonRef.current = outlineJson
      setEditedOutline(meta.outline!)
    }
  }, [outlineJson, meta.outline])

  // 如果 PPT 会话不活跃（查看历史记录时），只保留大纲和结果展示，隐藏中间交互控件
  const isResultStep = meta.step === "generating-images" || meta.step === "done" || meta.step === "outline-review"
  if (!pptSession?.active && !isResultStep) {
    return null
  }

  // If the session has moved past this message's step, don't render interactive controls
  if (isPastStep(meta.step, pptSession?.step)) {
    return null
  }

  // ─── Step: style-select ───
  if (meta.step === "style-select") {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          {PPT_STYLE_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`flex flex-col items-start border px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-muted/50 ${
                pptSession?.stylePreset === p.id ? "border-primary bg-primary/5" : "border-border"
              }`}
              onClick={() => onStyleSelect(p.id)}
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-[9px] text-muted-foreground/60">{p.colors}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ─── Step: slide-count ---
  if (meta.step === "slide-count") {
    const counts = [3, 5, 8, 10, 12, 15]
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <button
              key={c}
              className="border border-border px-3 py-1.5 text-[12px] transition-colors hover:bg-primary/5 hover:border-primary/50"
              onClick={() => onSlideCountSelect(c)}
            >
              {c} 页
            </button>
          ))}
          {!showCustomCount && (
            <button
              className="border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50"
              onClick={() => setShowCustomCount(true)}
            >
              自定义
            </button>
          )}
        </div>
        {showCustomCount && (
          <div className="flex items-center gap-1.5">
            <input
              ref={customCountRef}
              type="number"
              min={3}
              max={15}
              defaultValue={8}
              className="w-16 border border-border bg-background px-2 py-1 text-[12px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = parseInt((e.target as HTMLInputElement).value, 10)
                  if (isNaN(n) || n < 3 || n > 15) {
                    (e.target as HTMLInputElement).value = "8"
                    return
                  }
                  onSlideCountSelect(n)
                }
              }}
              autoFocus
            />
            <span className="text-[11px] text-muted-foreground">页</span>
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => {
                const val = customCountRef.current?.value || ""
                const n = parseInt(val, 10)
                if (isNaN(n) || n < 3 || n > 15) {
                  if (customCountRef.current) {
                    customCountRef.current.value = "8"
                    customCountRef.current.focus()
                  }
                  return
                }
                onSlideCountSelect(n)
              }}
            >
              确定
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── Step: custom-prompt ───
  if (meta.step === "custom-prompt") {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={customPromptText}
          onChange={(e) => setCustomPromptText(e.target.value)}
          placeholder="输入风格偏好或内容要求（可选）..."
          rows={2}
          className="w-full resize-none border border-border bg-background px-2.5 py-1.5 text-[12px] outline-none focus:border-primary/50"
        />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => onStartOutline(customPromptText.trim())}
            disabled={chatLoading}
          >
            {chatLoading ? <IconLoader2 className="size-3 animate-spin" /> : <IconSparkles className="size-3" />}
            {customPromptText.trim() ? "生成大纲" : "开始生成"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => onStartOutline("")}
            disabled={chatLoading}
          >
            跳过
          </Button>
        </div>
      </div>
    )
  }

  // ─── Step: generating-outline ───
  if (meta.step === "generating-outline") {
    return (
      <div className="mt-2">
        {meta.streamingText ? (
          <div className="border border-border bg-muted/30 p-2">
            <pre className="whitespace-pre-wrap break-all text-[10px] leading-relaxed text-muted-foreground max-h-[200px] overflow-y-auto">
              {meta.streamingText.slice(-500)}
            </pre>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <IconLoader2 className="size-3 animate-spin" />
            正在生成大纲...
          </div>
        )}
      </div>
    )
  }

  // ─── Step: error ───
  if (meta.step === "error") {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[12px] text-destructive">{meta.streamingText || "生成失败"}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-[11px]"
          onClick={onRegenerateOutline}
        >
          <IconRefresh className="size-3" />
          重试
        </Button>
      </div>
    )
  }

  // ─── Step: outline-review (只读，查看历史记录时) ───
  if (meta.step === "outline-review" && editedOutline && !pptSession?.active) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-[13px] font-medium">{editedOutline.title}</p>
        {editedOutline.slides.map((slide, i) => (
          <div key={i} className="border border-border p-2 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 bg-muted px-1.5 py-0.5 text-[10px] font-mono">{i + 1}</span>
              <span className="shrink-0 bg-primary/10 px-1 py-0.5 text-[10px] text-primary">{slide.layout}</span>
            </div>
            <p className="text-[12px] font-medium">{slide.title}</p>
            <ul className="ml-3 list-disc text-[11px] text-muted-foreground">
              {slide.bulletPoints.map((bp, j) => <li key={j}>{bp}</li>)}
            </ul>
          </div>
        ))}
      </div>
    )
  }

  // ─── Step: outline-review ───
  if (meta.step === "outline-review" && editedOutline) {
    const updateSlide = (index: number, updates: Partial<typeof editedOutline.slides[0]>) => {
      const slides = [...editedOutline.slides]
      slides[index] = { ...slides[index], ...updates }
      setEditedOutline({ ...editedOutline, slides })
    }
    const deleteSlide = (index: number) => {
      const slides = editedOutline.slides
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, pageNumber: i + 1 }))
      setEditedOutline({ ...editedOutline, slides })
    }

    return (
      <div className="mt-2 space-y-2">
        <input
          value={editedOutline.title}
          onChange={(e) => setEditedOutline({ ...editedOutline, title: e.target.value })}
          className="w-full bg-transparent text-[13px] font-medium outline-none"
        />
        {editedOutline.slides.map((slide, i) => (
          <div key={i} className="border border-border p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 bg-muted px-1.5 py-0.5 text-[10px] font-mono">{i + 1}</span>
                <span className="shrink-0 bg-primary/10 px-1 py-0.5 text-[10px] text-primary">{slide.layout}</span>
              </div>
              <button
                onClick={() => deleteSlide(i)}
                aria-label={`删除第 ${i + 1} 页幻灯片`}
                className="p-0.5 text-destructive/60 hover:text-destructive"
              >
                <IconTrash className="size-3" />
              </button>
            </div>
            <input
              value={slide.title}
              onChange={(e) => updateSlide(i, { title: e.target.value })}
              className="w-full bg-transparent text-[12px] font-medium outline-none"
            />
            <textarea
              value={slide.bulletPoints.join("\n")}
              onChange={(e) => updateSlide(i, { bulletPoints: e.target.value.split("\n").filter(Boolean) })}
              rows={Math.min(slide.bulletPoints.length, 4)}
              className="w-full resize-none bg-muted/30 px-1.5 py-1 text-[11px] outline-none"
            />
          </div>
        ))}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => onConfirmOutline(editedOutline)}
            disabled={chatLoading}
          >
            <IconCheck className="size-3" />
            确认并生成图片 ({editedOutline.slides.length} 页)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={onRegenerateOutline}
            disabled={chatLoading}
          >
            <IconRefresh className="size-3" />
            重新生成
          </Button>
        </div>
      </div>
    )
  }

  // ─── Step: generating-images / done ───
  if ((meta.step === "generating-images" || meta.step === "done") && meta.slideImages) {
    const doneCount = meta.slideImages.filter((s) => s.status === "done").length
    const errorCount = meta.slideImages.filter((s) => s.status === "error").length
    const total = meta.slideImages.length

    return (
      <div className="mt-2 space-y-2">
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          {meta.step === "done" && errorCount === 0 && <IconCheck className="size-3.5 text-green-500" />}
          {meta.step === "generating-images" && <IconLoader2 className="size-3.5 animate-spin text-primary" />}
          <span className="text-[11px] text-muted-foreground">
            {meta.step === "generating-images" ? `生成中 ${doneCount}/${total}` : `完成 ${doneCount}/${total}${errorCount ? ` · ${errorCount} 失败` : ""}`}
          </span>
          <div className="flex-1 h-1.5 overflow-hidden bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
          </div>
        </div>

        {/* Image grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {meta.slideImages.map((img, i) => (
            <div key={i} className="group relative overflow-hidden border border-border bg-muted/30">
              <span className="absolute left-1 top-1 z-10 bg-black/50 px-1 py-0.5 text-[9px] text-white">{i + 1}</span>
              {img.status === "done" && img.url ? (
                <div
                  className="relative aspect-video cursor-pointer"
                  onClick={() => { setPreviewIndex(i); setPreviewMode("single") }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={`Slide ${i + 1}`} className="size-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex items-center gap-0.5 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-black shadow-sm">
                      <IconEye className="size-3" />预览
                    </span>
                  </div>
                </div>
              ) : img.status === "generating" ? (
                <div className="flex aspect-video items-center justify-center">
                  <IconLoader2 className="size-4 animate-spin text-primary" />
                </div>
              ) : img.status === "error" ? (
                <div className="flex aspect-video flex-col items-center justify-center gap-1 p-2">
                  <IconAlertCircle className="size-4 text-destructive" />
                  <span className="text-center text-[9px] text-destructive">{img.error?.slice(0, 30)}</span>
                  <button
                    onClick={() => onRetrySlide(msg.id, i)}
                    className="text-[9px] text-primary hover:underline"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center">
                  <IconPresentation className="size-4 text-muted-foreground/30" />
                </div>
              )}
              {/* Slide title */}
              {meta.outline && (
                <div className="border-t px-1 py-0.5">
                  <p className="truncate text-[9px] text-muted-foreground">
                    {meta.outline.slides[i]?.title}
                  </p>
                  {showNotesForSlide === i && meta.outline.slides[i]?.speakerNote && (
                    <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground/70">
                      {meta.outline.slides[i].speakerNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        {meta.step === "done" && doneCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setPreviewMode("all")}
            >
              <IconEye className="size-3" />
              查看全部
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={downloading !== "none"}
              onClick={async () => {
                const doneImages = meta.slideImages!.filter((img) => img.status === "done" && img.url)
                if (doneImages.length === 0) return
                setDownloading("zip")
                try {
                  const res = await fetch(`/api/projects/${projectId}/download`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      format: "zip",
                      title: meta.outline?.title || "presentation",
                      images: doneImages.map((img) => img.url),
                    }),
                  })
                  if (!res.ok) throw new Error("下载失败")
                  const blob = await res.blob()
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `${meta.outline?.title || "presentation"}.zip`
                  a.click()
                  URL.revokeObjectURL(a.href)
                } catch (e) {
                  console.error("ZIP download failed:", e)
                } finally {
                  setDownloading("none")
                }
              }}
            >
              {downloading === "zip" ? <IconLoader2 className="size-3 animate-spin" /> : <IconDownload className="size-3" />}
              {downloading === "zip" ? "打包中..." : "全部下载 PNG"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={downloading !== "none"}
              onClick={async () => {
                const doneImages = meta.slideImages!.filter((img) => img.status === "done" && img.url)
                if (doneImages.length === 0) return
                setDownloading("pdf")
                try {
                  const res = await fetch(`/api/projects/${projectId}/download`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      format: "pdf",
                      title: meta.outline?.title || "presentation",
                      images: doneImages.map((img) => img.url),
                    }),
                  })
                  if (!res.ok) throw new Error("导出失败")
                  const blob = await res.blob()
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `${meta.outline?.title || "presentation"}.pdf`
                  a.click()
                  URL.revokeObjectURL(a.href)
                } catch (e) {
                  console.error("PDF export failed:", e)
                } finally {
                  setDownloading("none")
                }
              }}
            >
              {downloading === "pdf" ? <IconLoader2 className="size-3 animate-spin" /> : <IconDownload className="size-3" />}
              {downloading === "pdf" ? "导出中..." : "导出 PDF"}
            </Button>
          </div>
        )}

        {/* Full-page modal preview */}
        {previewMode !== "none" && meta.slideImages && (() => {
          const doneImages = meta.slideImages!.filter((img) => img.status === "done" && img.url)
          if (doneImages.length === 0) return null
          return (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setPreviewMode("none")}
              onKeyDown={(e) => e.key === "Escape" && setPreviewMode("none")}
              role="dialog"
              aria-modal="true"
              aria-label="幻灯片预览"
            >
              <div className="relative flex h-[90vh] w-[90vw] max-w-5xl flex-col bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
                  <span className="text-sm font-medium">
                    {previewMode === "single" ? `幻灯片预览 ${previewIndex + 1} / ${meta.slideImages!.length}` : `全部幻灯片（${doneImages.length} 页）`}
                  </span>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setPreviewMode("none")}>
                    <IconX className="size-4" />
                  </Button>
                </div>
                {/* Content */}
                {previewMode === "single" ? (
                  <div className="flex flex-1 items-center justify-center overflow-hidden p-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={meta.slideImages![previewIndex]?.url || doneImages[0].url!}
                      alt={`Slide ${previewIndex + 1}`}
                      className="max-h-full max-w-full border border-border object-contain shadow-lg"
                    />
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="mx-auto grid max-w-4xl gap-4">
                      {doneImages.map((img, i) => (
                        <div key={i} className="relative">
                          <span className="absolute left-3 top-3 z-10 bg-black/60 px-2 py-1 text-xs font-medium text-white">{i + 1}</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url!} alt={`Slide ${i + 1}`} className="w-full border border-border shadow-md" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Footer navigation for single mode */}
                {previewMode === "single" && meta.slideImages!.length > 1 && (
                  <div className="flex shrink-0 items-center justify-center gap-4 border-t px-5 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={previewIndex <= 0}
                      onClick={() => setPreviewIndex((v) => Math.max(0, v - 1))}
                    >
                      上一页
                    </Button>
                    <span className="text-sm text-muted-foreground">{previewIndex + 1} / {meta.slideImages!.length}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={previewIndex >= meta.slideImages!.length - 1}
                      onClick={() => setPreviewIndex((v) => Math.min(meta.slideImages!.length - 1, v + 1))}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  return null
}
