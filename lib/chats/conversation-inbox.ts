import type { ChatConversation, ChatMessage } from "./types"

/** Non-system messages currently pinned in the thread. */
export function getPinnedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.pinned && message.type !== "SYSTEM")
}

export function conversationHasPinnedMessages(conversation: ChatConversation): boolean {
  if (conversation.latestPinnedAt) return true
  return getPinnedMessages(conversation.messages).length > 0
}

/** Latest pin time — matches conversations.latest_pinned_at in Postgres. */
export function getLatestPinnedAt(conversation: ChatConversation): string | null {
  if (conversation.latestPinnedAt) {
    return new Date(conversation.latestPinnedAt).toISOString()
  }

  const pinned = getPinnedMessages(conversation.messages)
  if (pinned.length === 0) return null

  return pinned
    .map((message) => message.pinnedAt ?? message.sentAt)
    .sort((a, b) => b.localeCompare(a))[0]
}

export function sortConversationsForInbox(
  conversations: ChatConversation[],
): ChatConversation[] {
  return [...conversations].sort((a, b) => {
    const aPinnedAt = getLatestPinnedAt(a)
    const bPinnedAt = getLatestPinnedAt(b)

    if (aPinnedAt && bPinnedAt) {
      const byPin = bPinnedAt.localeCompare(aPinnedAt)
      if (byPin !== 0) return byPin
    } else if (aPinnedAt) {
      return -1
    } else if (bPinnedAt) {
      return 1
    }

    const aTime = a.lastMessage?.sentAt ?? ""
    const bTime = b.lastMessage?.sentAt ?? ""
    return bTime.localeCompare(aTime)
  })
}

/** Keep last occurrence of each message id (realtime upserts win over stale copies). */
export function dedupeMessagesById(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const message of messages) {
    byId.set(message.id, message)
  }
  return Array.from(byId.values()).sort((a, b) => a.sentAt.localeCompare(b.sentAt))
}

export function splitInboxSections(conversations: ChatConversation[]): {
  pinned: ChatConversation[]
  recent: ChatConversation[]
} {
  const pinned = conversations
    .filter((conversation) => conversationHasPinnedMessages(conversation))
    .sort((a, b) => {
      const aAt = getLatestPinnedAt(a) ?? ""
      const bAt = getLatestPinnedAt(b) ?? ""
      return bAt.localeCompare(aAt)
    })

  const recent = conversations.filter(
    (conversation) => !conversationHasPinnedMessages(conversation),
  )

  return { pinned, recent }
}
