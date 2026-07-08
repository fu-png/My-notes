"use client"

import * as React from "react"
import {
  IconPlus,
  IconTrash,
  IconMessage2,
  IconRobot,
  IconNotebook,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Conversation } from "./types"

// ─── ConversationList ───

export interface ConversationListProps {
  conversations: Conversation[]
  activeConversationId: string | null
  onStartNewConversation: () => void
  onLoadConversation: (id: string) => void
  onDeleteConversation: (convId: string) => void
  layoutMode: "notebook" | "agent"
  onLayoutModeChange: (v: "notebook" | "agent") => void
}

export const ConversationList = React.memo(function ConversationList({
  conversations,
  activeConversationId,
  onStartNewConversation,
  onLoadConversation,
  onDeleteConversation,
  layoutMode,
  onLayoutModeChange,
}: ConversationListProps) {
  return (
    <div className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r bg-muted/20 md:flex">
      {/* Header with mode switch */}
      <div className="flex h-[49px] items-center border-b px-3">
        <Tabs value={layoutMode} onValueChange={(v) => onLayoutModeChange(v as "notebook" | "agent")} className="w-full">
          <TabsList className="h-9 w-full">
            <TabsTrigger value="agent" className="flex-1 gap-1.5 text-sm">
              <IconRobot className="size-4" />
              Agent
            </TabsTrigger>
            <TabsTrigger value="notebook" className="flex-1 gap-1.5 text-sm">
              <IconNotebook className="size-4" />
              Notebook
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* New conversation button */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">对话列表</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              onClick={onStartNewConversation}
            >
              <IconPlus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建对话</TooltipContent>
        </Tooltip>
      </div>

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-3 py-12 text-center text-sm text-muted-foreground">
            <IconMessage2 className="mx-auto mb-2 size-6 opacity-30" />
            <p>暂无对话</p>
            <p className="mt-1 text-xs">点击 + 开始新对话</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => onLoadConversation(conv.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onLoadConversation(conv.id)
                }
              }}
              className={`group flex cursor-pointer items-center gap-2 border-l-2 px-3 py-2.5 text-[13px] transition-colors ${
                activeConversationId === conv.id
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <IconMessage2 className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{conv.title || "新对话"}</span>
              <div className="ml-1 w-0 shrink-0 overflow-hidden opacity-0 transition-all duration-150 group-hover:w-6 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteConversation(conv.id)
                  }}
                  aria-label={`删除对话 ${conv.title}`}
                  className="p-1 text-muted-foreground hover:text-destructive"
                >
                  <IconTrash className="size-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
})
