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
  IconFileText,
  IconSend,
  IconWorld,
  IconBrain,
  IconPresentation,
  IconAlertCircle,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
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
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Switch } from "@/components/ui/switch"
import type { ChatMessage, Conversation, DocFile, PptOutline, SlideImage } from "./types"
import { GENERATE_TEMPLATES, PPT_STYLE_PRESETS } from "./types"

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
  onToggleDeepThink: () => void
  selectedText: string
  onClearSelectedText: () => void
  onStartNewConversation: () => void
  onLoadConversation: (conv: Conversation) => void
  onDeleteConversation: (convId: string) => void
  onFetchSourcesData: () => void
  onChatScroll: () => void

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
  onPptCancel: () => void
}

// ─── Component ───

export function ChatPanel({
  projectName,
  projectId,
  files,
  chatMessages,
  chatInput,
  chatLoading,
  chatModel,
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
  onToggleDeepThink,
  selectedText,
  onClearSelectedText,
  onStartNewConversation,
  onLoadConversation,
  onDeleteConversation,
  onFetchSourcesData,
  onChatScroll,
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
  onPptCancel,
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
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onSetShowHistory(false)}>
                <IconArrowLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium">历史对话</span>
            </>
          ) : (
            <>
              <IconSparkles className="size-4 text-primary" />
              <span className="text-sm font-medium">AI 助手</span>
              {deepThinkMode && (
                <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  <IconBrain className="size-2.5" />
                  深度思考
                </span>
              )}
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
                    >
                      <IconDatabase className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">来源管理</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={onStartNewConversation}>
                    <IconPlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新对话</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onSetShowHistory(true)}>
                    <IconHistory className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">历史对话</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onSetShowAI(false)}>
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
                    <div className="max-w-[85%] px-3 py-2 text-[13px] leading-relaxed bg-primary text-primary-foreground whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full overflow-hidden text-[13px] leading-relaxed [&_article]:max-w-none [&_article]:text-[13px] [&_article]:leading-relaxed [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:text-xs [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:text-xs [&_blockquote]:my-2 [&_blockquote]:text-[13px] [&_hr]:my-3 [&_table]:text-xs [&_img]:max-w-full">
                      {/* 深度思考推理过程 */}
                      {msg.reasoning && (() => {
                        const isLastMsg = msg.id === chatMessages[chatMessages.length - 1]?.id
                        const isThinking = chatLoading && isLastMsg
                        const hasContent = !!msg.content
                        return (
                          <details
                            className="mb-2 border border-primary/20 bg-primary/5 text-xs"
                            {...(isThinking || !hasContent ? { open: true } : {})}
                          >
                            <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-primary/80 hover:text-primary">
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
                            </summary>
                            <div className="border-t border-primary/10 px-2.5 py-2 text-muted-foreground [&_p]:my-1 [&_p]:leading-relaxed">
                              <MarkdownRenderer content={msg.reasoning} />
                            </div>
                          </details>
                        )
                      })()}
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
                          pptSession={pptSession}
                          chatLoading={chatLoading}
                          onStyleSelect={onPptStyleSelect}
                          onSlideCountSelect={onPptSlideCountSelect}
                          onStartOutline={onPptStartOutline}
                          onConfirmOutline={onPptConfirmOutline}
                          onRetrySlide={onPptRetrySlide}
                          onRegenerateOutline={onPptRegenerateOutline}
                          onCancel={onPptCancel}
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[11px]"
                            onClick={() => onSaveGenerated(msg.id)}
                          >
                            <IconDownload className="size-3" />
                            保存为笔记
                          </Button>
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
                onSendMessage()
              }
            }}
            placeholder={deepThinkMode ? "深度思考已开启，输入问题让 AI 深入推理..." : "输入问题，按 Enter 发送..."}
            disabled={chatLoading}
            rows={2}
            className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Switch
                      size="sm"
                      checked={deepThinkMode}
                      onCheckedChange={onToggleDeepThink}
                    />
                    <span className={`flex items-center gap-0.5 text-[11px] ${deepThinkMode ? "text-primary" : "text-muted-foreground/70"}`}>
                      <IconBrain className="size-3" />
                      深度思考
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {deepThinkMode ? "深度思考已开启，点击关闭" : "开启深度思考模式"}
                </TooltipContent>
              </Tooltip>
              <span className="text-[11px] text-muted-foreground/70">
                {chatModel}{ragEnabled && indexStatus?.indexed ? " · RAG" : ""}
              </span>
            </div>
            <Button
              size="icon"
              className="size-6"
              onClick={onSendMessage}
              disabled={chatLoading || !chatInput.trim()}
            >
              <IconSend className="size-3" />
            </Button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}

// ─── Sub-components ───

function SourcesPanel({
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
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
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
}

function HistoryPanel({
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
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="p-3">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <IconMessage className="mb-2 size-8 opacity-30" />
            <p className="text-sm">暂无历史对话</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 border px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${conv.id === activeConversationId ? "border-primary/30 bg-primary/5" : "border-border"}`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => onLoad(conv)}
                >
                  <IconMessage className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(conv.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                >
                  <IconTrash className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-[12px]"
            onClick={() => onPlay(msg.id)}
          >
            <IconPlayerPlay className="size-3.5" />
            浏览器朗读
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
              <><IconPlayerPlay className="size-3.5" />{msg.audioMeta.audioUrl ? "播放音频" : "浏览器朗读"}</>
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
  pptSession,
  chatLoading,
  onStyleSelect,
  onSlideCountSelect,
  onStartOutline,
  onConfirmOutline,
  onRetrySlide,
  onRegenerateOutline,
  onCancel,
}: {
  msg: ChatMessage
  pptSession: ChatPanelProps["pptSession"]
  chatLoading: boolean
  onStyleSelect: (styleId: string) => void
  onSlideCountSelect: (count: number) => void
  onStartOutline: (customPrompt: string) => void
  onConfirmOutline: (outline: PptOutline) => void
  onRetrySlide: (msgId: string, slideIndex: number) => void
  onRegenerateOutline: () => void
  onCancel: () => void
}) {
  const meta = msg.pptMeta!
  const [customPromptText, setCustomPromptText] = React.useState("")
  const [editedOutline, setEditedOutline] = React.useState<PptOutline | null>(null)
  const [showNotesForSlide, setShowNotesForSlide] = React.useState<number | null>(null)
  const [showCustomCount, setShowCustomCount] = React.useState(false)
  const customCountRef = React.useRef<HTMLInputElement>(null)

  // Sync edited outline when meta.outline changes — always sync on new outline
  const outlineJson = meta.outline ? JSON.stringify(meta.outline) : null
  const editedJson = editedOutline ? JSON.stringify(editedOutline) : null
  React.useEffect(() => {
    if (outlineJson && outlineJson !== editedJson) {
      setEditedOutline(meta.outline!)
    }
  }, [outlineJson, editedJson, meta.outline])

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
        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={onCancel}>
          取消
        </Button>
      </div>
    )
  }

  // ─── Step: slide-count ───
  if (meta.step === "slide-count") {
    const counts = [5, 6, 7, 8, 10, 12, 15]
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
              className="w-16 border border-border bg-background px-2 py-1 text-[12px] rounded"
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
          <div className="rounded border border-border bg-muted/30 p-2">
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
        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={onCancel}>
          取消
        </Button>
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

  // ─── Step: outline-review ───
  if (meta.step === "outline-review" && editedOutline) {
    const updateSlide = (index: number, updates: Partial<typeof editedOutline.slides[0]>) => {
      const slides = [...editedOutline.slides]
      slides[index] = { ...slides[index], ...updates }
      setEditedOutline({ ...editedOutline, slides })
    }
    const deleteSlide = (index: number) => {
      const slides = editedOutline.slides.filter((_, i) => i !== index)
      slides.forEach((s, i) => (s.pageNumber = i + 1))
      setEditedOutline({ ...editedOutline, slides })
    }
    const moveSlide = (index: number, dir: "up" | "down") => {
      const slides = [...editedOutline.slides]
      const t = dir === "up" ? index - 1 : index + 1
      if (t < 0 || t >= slides.length) return
      ;[slides[index], slides[t]] = [slides[t], slides[index]]
      slides.forEach((s, i) => (s.pageNumber = i + 1))
      setEditedOutline({ ...editedOutline, slides })
    }

    return (
      <div className="mt-2 space-y-2">
        <input
          value={editedOutline.title}
          onChange={(e) => setEditedOutline({ ...editedOutline, title: e.target.value })}
          className="w-full border-b border-border bg-transparent text-[13px] font-medium outline-none focus:border-primary/50"
        />
        {editedOutline.slides.map((slide, i) => (
          <div key={i} className="rounded border border-border p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{i + 1}</span>
              <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">{slide.layout}</span>
              <input
                value={slide.title}
                onChange={(e) => updateSlide(i, { title: e.target.value })}
                className="flex-1 border-none bg-transparent text-[12px] font-medium outline-none"
              />
              <button onClick={() => moveSlide(i, "up")} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <IconChevronRight className="size-3 rotate-[-90deg]" />
              </button>
              <button onClick={() => moveSlide(i, "down")} disabled={i === editedOutline.slides.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <IconChevronRight className="size-3 rotate-90" />
              </button>
              <button onClick={() => deleteSlide(i)} className="text-destructive/60 hover:text-destructive">
                <IconTrash className="size-3" />
              </button>
            </div>
            <textarea
              value={slide.bulletPoints.join("\n")}
              onChange={(e) => updateSlide(i, { bulletPoints: e.target.value.split("\n").filter(Boolean) })}
              rows={Math.min(slide.bulletPoints.length, 4)}
              className="w-full resize-none border border-border bg-background px-1.5 py-1 text-[11px] outline-none focus:border-primary/30"
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
          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
          </div>
          {meta.step === "generating-images" && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={onCancel}>
              取消
            </Button>
          )}
        </div>

        {/* Image grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {meta.slideImages.map((img, i) => (
            <div key={i} className="group relative overflow-hidden rounded border border-border bg-muted/30">
              <span className="absolute left-1 top-1 z-10 rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">{i + 1}</span>
              {img.status === "done" && img.url ? (
                <div className="relative aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={`Slide ${i + 1}`} className="size-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <a
                      href={img.url}
                      download={`slide-${i + 1}.png`}
                      className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-black hover:bg-white"
                    >
                      <IconDownload className="size-2.5 inline" /> 下载
                    </a>
                    <button
                      onClick={() => onRetrySlide(msg.id, i)}
                      className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-black hover:bg-white"
                    >
                      <IconRefresh className="size-2.5 inline" /> 重试
                    </button>
                    {meta.outline?.slides[i]?.speakerNote && (
                      <button
                        onClick={() => setShowNotesForSlide(showNotesForSlide === i ? null : i)}
                        className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-black hover:bg-white"
                      >
                        备注
                      </button>
                    )}
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

        {/* Download buttons */}
        {meta.step === "done" && doneCount > 0 && (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => {
                meta.slideImages!.forEach((img, i) => {
                  if (img.status === "done" && img.url) {
                    setTimeout(() => {
                      const a = document.createElement("a")
                      a.href = img.url!
                      a.download = `slide-${i + 1}-${meta.outline?.title || "presentation"}.png`
                      a.click()
                    }, i * 300)
                  }
                })
              }}
            >
              <IconDownload className="size-3" />
              全部下载 PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={async () => {
                const doneImages = meta.slideImages!.filter((img) => img.status === "done" && img.url)
                if (doneImages.length === 0) return
                // Create a simple PDF by opening all images in a new window for print-to-PDF
                const win = window.open("", "_blank")
                if (!win) return
                win.document.write(`<html><head><title>${meta.outline?.title || "Presentation"}</title>
                  <style>body{margin:0;display:flex;flex-direction:column}img{width:100%;page-break-after:always}</style>
                  </head><body>`)
                for (const img of doneImages) {
                  win.document.write(`<img src="${img.url}" />`)
                }
                win.document.write("</body></html>")
                win.document.close()
                setTimeout(() => win.print(), 1000)
              }}
            >
              <IconDownload className="size-3" />
              导出 PDF
            </Button>
          </div>
        )}
      </div>
    )
  }

  return null
}
