import type { ChatConversation, ConversationType } from "./types"

export function getConversationDisplayTitle(
  conversation: ChatConversation,
  currentUserId: string,
): string {
  if (conversation.type === "DIRECT") {
    return (
      conversation.participants.find((participant) => participant.id !== currentUserId)?.name ??
      conversation.title
    )
  }

  return conversation.title
}

export function getConversationSubtitle(
  conversation: ChatConversation,
  currentUserId: string,
): string | null {
  if (conversation.type === "DIRECT") {
    const peer = conversation.participants.find((participant) => participant.id !== currentUserId)
    return peer?.subtitle ?? (peer?.role === "member" ? "Member" : "Staff")
  }

  const typeLabel = formatConversationTypeLabel(conversation.type)
  const memberCount = conversation.participants.length
  return typeLabel ? `${typeLabel} · ${memberCount} members` : `${memberCount} members`
}

export function formatConversationTypeLabel(type: ConversationType): string | null {
  if (type === "DIRECT") return null
  return type.charAt(0) + type.slice(1).toLowerCase()
}
