"use client"

import { Pin } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  formatMessageTime,
  initialsFromName,
  previewMessage,
} from "@/lib/chats/format"
import { conversationHasPinnedMessages } from "@/lib/chats/conversation-inbox"
import type { ChatConversation } from "@/lib/chats/types"

type ConversationListItemProps = {
  conversation: ChatConversation
  isActive: boolean
  currentUserId: string
  onSelect: (id: string) => void
}

function typeAccent(type: ChatConversation["type"]): string {
  switch (type) {
    case "LOAN":
      return "ring-[#f08c2b]/40"
    case "SUPPORT":
      return "ring-sky-400/40"
    case "GROUP":
    case "COMMITTEE":
      return "ring-violet-400/40"
    case "BRANCH":
      return "ring-emerald-400/40"
    default:
      return "ring-border"
  }
}

function typeLabel(type: ChatConversation["type"]): string | null {
  if (type === "DIRECT") return null
  return type.charAt(0) + type.slice(1).toLowerCase()
}

export function ConversationListItem({
  conversation,
  isActive,
  currentUserId,
  onSelect,
}: ConversationListItemProps) {
  const { lastMessage, unreadCount, title, type } = conversation
  const hasPinnedMessages = conversationHasPinnedMessages(conversation)
  const previewSender =
    lastMessage?.senderId === currentUserId
      ? "You: "
      : conversation.participants.find((p) => p.id === lastMessage?.senderId)?.name
        ? `${conversation.participants.find((p) => p.id === lastMessage?.senderId)?.name}: `
        : ""

  const displayTitle =
    type === "DIRECT"
      ? conversation.participants.find((p) => p.id !== currentUserId)?.name ?? title
      : title

  const otherParticipant = conversation.participants.find((p) => p.id !== currentUserId)

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors",
        isActive ? "bg-[#fff7ed]" : "hover:bg-muted/40",
      )}
    >
      <div className="relative shrink-0">
        <Avatar className={cn("h-11 w-11 ring-2", typeAccent(type))}>
          {otherParticipant?.avatarUrl ? (
            <AvatarImage src={otherParticipant.avatarUrl} alt={displayTitle} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {initialsFromName(displayTitle)}
          </AvatarFallback>
        </Avatar>
        {otherParticipant?.isOnline ? (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {hasPinnedMessages ? <Pin className="h-3 w-3 shrink-0 text-[#f08c2b]" /> : null}
            <span
              className={cn(
                "truncate text-sm",
                unreadCount > 0 ? "font-semibold text-foreground" : "font-medium text-foreground",
              )}
            >
              {displayTitle}
            </span>
          </div>
          {lastMessage ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatMessageTime(lastMessage.sentAt)}
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-xs",
              unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {lastMessage
              ? `${previewSender}${previewMessage(lastMessage.body, lastMessage.type)}`
              : "No messages yet"}
          </p>
          {unreadCount > 0 ? (
            <Badge className="h-5 min-w-5 shrink-0 justify-center bg-[#f08c2b] px-1.5 text-[10px] hover:bg-[#f08c2b]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
        </div>

        {typeLabel(type) ? (
          <span className="mt-1.5 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {typeLabel(type)}
          </span>
        ) : null}
      </div>
    </button>
  )
}
