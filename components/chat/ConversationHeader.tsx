"use client"

import { useState } from "react"
import { ArrowLeft, MoreHorizontal, Search, UserPlus, Users } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { initialsFromName } from "@/lib/chats/format"
import type { ChatConversation } from "@/lib/chats/types"
import { ParticipantNameLink } from "./ParticipantNameLink"

type ConversationHeaderProps = {
  conversation: ChatConversation
  currentUserId: string
  onBack?: () => void
  showBack?: boolean
  enableMemberLinks?: boolean
  onSearchMessages?: () => void
  onAddParticipants?: () => void
  searchActive?: boolean
}

function typeBadgeClass(type: ChatConversation["type"]): string {
  switch (type) {
    case "LOAN":
      return "bg-[#fff7ed] text-[#c46f12] border-[#f08c2b]/30"
    case "SUPPORT":
      return "bg-sky-50 text-sky-700 border-sky-200"
    case "GROUP":
    case "COMMITTEE":
      return "bg-violet-50 text-violet-700 border-violet-200"
    case "BRANCH":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

function conversationHeaderSubtitle(
  conversation: ChatConversation,
  isDirect: boolean,
  peer: ChatConversation["participants"][number] | undefined,
): string {
  if (conversation.type === "SUPPORT") {
    const member = conversation.participants.find((p) => p.role === "member")
    if (member) {
      const parts = [member.name]
      if (conversation.supportStatus) parts.push(conversation.supportStatus.toLowerCase())
      const agentCount = conversation.participants.filter((p) => p.role === "staff").length
      if (agentCount > 0) parts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`)
      return parts.join(" · ")
    }
    return "Branch support"
  }

  if (isDirect) {
    return peer?.isOnline ? "Online" : "Offline"
  }

  const onlineCount = conversation.participants.filter((p) => p.isOnline).length
  const parts: string[] = [`${conversation.participants.length} participants`]

  if (conversation.reference?.type === "LOAN") {
    parts.unshift(conversation.reference.label)
  }

  if (onlineCount > 0) {
    parts.push(`${onlineCount} online`)
  }

  return parts.join(" · ")
}

export function ConversationHeader({
  conversation,
  currentUserId,
  onBack,
  showBack,
  enableMemberLinks = true,
  onSearchMessages,
  onAddParticipants,
  searchActive = false,
}: ConversationHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isDirect = conversation.type === "DIRECT"
  const peer = conversation.participants.find((p) => p.id !== currentUserId)
  const displayTitle = isDirect ? (peer?.name ?? conversation.title) : conversation.title
  const subtitle = conversationHeaderSubtitle(conversation, isDirect, peer)

  const runAfterMenuClose = (action?: () => void) => {
    setMenuOpen(false)
    if (!action) return
    window.setTimeout(action, 0)
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {showBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={onBack}
            aria-label="Back to inbox"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}

        {isDirect ? (
          <Avatar className="h-10 w-10 ring-2 ring-[#f08c2b]/20">
            {peer?.avatarUrl ? <AvatarImage src={peer.avatarUrl} alt={displayTitle} /> : null}
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initialsFromName(displayTitle)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isDirect ? (
              <ParticipantNameLink
                participant={peer}
                enableMemberLinks={enableMemberLinks}
                className="truncate text-sm font-semibold text-foreground"
              >
                {displayTitle}
              </ParticipantNameLink>
            ) : (
              <h2 className="truncate text-sm font-semibold text-foreground">{displayTitle}</h2>
            )}
            {!isDirect ? (
              <Badge variant="outline" className={cn("text-[10px] uppercase", typeBadgeClass(conversation.type))}>
                {conversation.type.toLowerCase()}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "shrink-0 text-muted-foreground",
              searchActive && "bg-[#fff7ed] text-[#c46f12]",
            )}
            aria-label="Conversation options"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={(event) => {
              event.preventDefault()
              runAfterMenuClose(onSearchMessages)
            }}
          >
            <Search className="h-4 w-4" />
            Search in this chat
          </DropdownMenuItem>
          {!isDirect && onAddParticipants ? (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(event) => {
                event.preventDefault()
                runAfterMenuClose(onAddParticipants)
              }}
            >
              <UserPlus className="h-4 w-4" />
              {conversation.type === "SUPPORT" ? "Add support agents" : "Add participant"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
