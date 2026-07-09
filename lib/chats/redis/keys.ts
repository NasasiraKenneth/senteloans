import type { InboxQuery } from "@/lib/chats/server/inbox-query"

function normalizeCachePart(value: string): string {
  return value.trim().toLowerCase().replace(/:/g, "_") || "_"
}

export function inboxCacheKey(chatIdentityId: string, query: InboxQuery = {}): string {
  const filter = normalizeCachePart(query.filter ?? "all")
  const search = normalizeCachePart(query.search ?? "")
  return `chat:inbox:${chatIdentityId}:${filter}:${search}`
}

export function inboxChannel(chatIdentityId: string): string {
  return `chat:inbox:events:${chatIdentityId}`
}

export function threadChannel(conversationId: string): string {
  return `chat:thread:events:${conversationId}`
}

export function presenceKey(chatIdentityId: string): string {
  return `chat:presence:${chatIdentityId}`
}
