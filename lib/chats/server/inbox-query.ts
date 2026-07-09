import type { ConversationFilter } from "@/lib/chats/types"

export type InboxQuery = {
  filter?: ConversationFilter
  search?: string
}

export function normalizeInboxFilter(filter?: string | null): ConversationFilter {
  const value = (filter ?? "all").trim().toUpperCase()
  const allowed: ConversationFilter[] = [
    "all",
    "DIRECT",
    "GROUP",
    "COMMITTEE",
    "LOAN",
    "BRANCH",
    "SUPPORT",
  ]
  return allowed.includes(value as ConversationFilter) ? (value as ConversationFilter) : "all"
}

export function toIlikePattern(term: string): string {
  const trimmed = term.trim()
  if (!trimmed) return ""
  const escaped = trimmed.replace(/[%_\\]/g, "\\$&")
  return `%${escaped}%`
}

export function inboxFilterSql(filter: ConversationFilter): string | null {
  return filter === "all" ? null : filter
}
