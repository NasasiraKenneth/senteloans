"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { buildChatsQueryString } from "@/lib/chats/client/build-query"
import {
  formatConversationTypeLabel,
  getConversationDisplayTitle,
  getConversationSubtitle,
} from "@/lib/chats/conversation-display"
import { initialsFromName, previewMessage } from "@/lib/chats/format"
import type {
  ChatConversation,
  ChatInboxResponse,
  ConversationFilter,
  ConversationType,
} from "@/lib/chats/types"

type ConversationPickerProps = {
  conversations?: ChatConversation[]
  inboxApiBase?: string | null
  currentUserId: string
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  excludeIds?: string[]
}

const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "DIRECT", label: "Direct" },
  { id: "GROUP", label: "Groups" },
  { id: "LOAN", label: "Loan" },
  { id: "SUPPORT", label: "Support" },
]

function matchesFilter(conversation: ChatConversation, filter: ConversationFilter): boolean {
  if (filter === "all") return true
  return conversation.type === filter
}

function typeAccent(type: ConversationType): string {
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

export function ConversationPicker({
  conversations = [],
  inboxApiBase = null,
  currentUserId,
  selectedIds,
  onSelectedIdsChange,
  excludeIds = [],
}: ConversationPickerProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [filter, setFilter] = useState<ConversationFilter>("all")
  const [remoteConversations, setRemoteConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(Boolean(inboxApiBase))

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!inboxApiBase) return

    let cancelled = false
    setLoading(true)

    const loadConversations = async () => {
      try {
        const response = await fetch(
          `${inboxApiBase}${buildChatsQueryString({
            search: debouncedQuery,
            filter: filter !== "all" ? filter : undefined,
          })}`,
          { cache: "no-store" },
        )
        const data = (await response.json()) as ChatInboxResponse & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || "Failed to load conversations")
        }
        if (!cancelled) setRemoteConversations(data.conversations ?? [])
      } catch {
        if (!cancelled) setRemoteConversations([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadConversations()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, filter, inboxApiBase])

  const sourceConversations = inboxApiBase ? remoteConversations : conversations

  const visibleConversations = useMemo(() => {
    const excluded = new Set(excludeIds)
    const q = inboxApiBase ? "" : query.trim().toLowerCase()

    return sourceConversations.filter((conversation) => {
      if (excluded.has(conversation.id)) return false
      if (!inboxApiBase && !matchesFilter(conversation, filter)) return false
      if (inboxApiBase || !q) return true

      const title = getConversationDisplayTitle(conversation, currentUserId)
      const subtitle = getConversationSubtitle(conversation, currentUserId)
      const lastPreview = conversation.lastMessage
        ? previewMessage(conversation.lastMessage.body, conversation.lastMessage.type)
        : ""

      const haystack = [title, subtitle, lastPreview, conversation.reference?.label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(q)
    })
  }, [conversations, currentUserId, excludeIds, filter, inboxApiBase, query, sourceConversations])

  const toggleConversation = (conversationId: string) => {
    if (selectedIds.includes(conversationId)) {
      onSelectedIdsChange(selectedIds.filter((id) => id !== conversationId))
      return
    }

    onSelectedIdsChange([...selectedIds, conversationId])
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations..."
          className="h-9 pl-9 focus-visible:ring-[#f08c2b]/40"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === item.id
                ? "bg-[#f08c2b] text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border/80">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading conversations…</p>
        ) : visibleConversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No conversations found.
          </p>
        ) : (
          visibleConversations.map((conversation) => {
            const isSelected = selectedIds.includes(conversation.id)
            const displayTitle = getConversationDisplayTitle(conversation, currentUserId)
            const subtitle = getConversationSubtitle(conversation, currentUserId)
            const otherParticipant = conversation.participants.find(
              (participant) => participant.id !== currentUserId,
            )
            const typeLabel = formatConversationTypeLabel(conversation.type)

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => toggleConversation(conversation.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
                  isSelected ? "bg-[#fff7ed]" : "hover:bg-muted/40",
                )}
              >
                <Avatar className={cn("h-9 w-9 shrink-0 ring-2", typeAccent(conversation.type))}>
                  {otherParticipant?.avatarUrl ? (
                    <AvatarImage src={otherParticipant.avatarUrl} alt={displayTitle} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initialsFromName(displayTitle)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-foreground">{displayTitle}</p>
                    {typeLabel ? (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        {typeLabel}
                      </span>
                    ) : null}
                  </div>
                  {subtitle ? (
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>

                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-[#f08c2b] bg-[#f08c2b] text-white"
                      : "border-border bg-background text-transparent",
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
