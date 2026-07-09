import type { ChatContact } from "./types"
import type { ChatConversation, ChatMessage, ChatParticipant } from "./types"

export function contactToParticipant(contact: ChatContact): ChatParticipant {
  return {
    id: contact.id,
    name: contact.name,
    role: contact.role,
    memberId: contact.memberId,
    subtitle: contact.subtitle,
  }
}

export function buildDirectConversation(
  contact: ChatContact,
  currentUserId: string,
  currentUserName = "You",
): ChatConversation {
  const id = `conv-direct-${contact.id}`
  return {
    id,
    type: "DIRECT",
    title: contact.name,
    unreadCount: 0,
    participants: [
      { id: currentUserId, name: currentUserName, role: "staff" },
      contactToParticipant(contact),
    ],
    messages: [],
  }
}

export function buildGroupConversation(
  name: string,
  contacts: ChatContact[],
  currentUserId: string,
  currentUserName = "You",
  description = "",
): ChatConversation {
  const id = `conv-group-${Date.now()}`
  const trimmed = name.trim()
  const now = new Date().toISOString()
  const participants: ChatParticipant[] = [
    { id: currentUserId, name: currentUserName, role: "staff" },
    ...contacts.map(contactToParticipant),
  ]

  const systemBody = description.trim()
    ? `Group "${trimmed}" created — ${description.trim()}`
    : `Group "${trimmed}" created`

  return {
    id,
    type: "GROUP",
    title: trimmed,
    unreadCount: 0,
    participants,
    messages: [
      {
        id: `m-sys-${id}`,
        conversationId: id,
        senderId: "system",
        type: "SYSTEM",
        body: systemBody,
        sentAt: now,
      },
    ],
    lastMessage: {
      body: systemBody,
      sentAt: now,
      senderId: "system",
      type: "SYSTEM",
    },
  }
}

export function findExistingDirectConversation(
  conversations: ChatConversation[],
  contactId: string,
): ChatConversation | undefined {
  return conversations.find(
    (conversation) =>
      conversation.type === "DIRECT" &&
      conversation.participants.some((participant) => participant.id === contactId),
  )
}

export function buildParticipantsAddedSystemMessage(
  conversationId: string,
  addedNames: string[],
  addedByName = "You",
): ChatMessage {
  const now = new Date().toISOString()
  const body =
    addedNames.length === 1
      ? `${addedByName} added ${addedNames[0]}`
      : `${addedByName} added ${addedNames.slice(0, -1).join(", ")} and ${addedNames[addedNames.length - 1]}`

  return {
    id: `m-sys-add-${Date.now()}`,
    conversationId,
    senderId: "system",
    type: "SYSTEM",
    body,
    sentAt: now,
  }
}

export function mergeParticipants(
  existing: ChatParticipant[],
  contacts: ChatContact[],
): ChatParticipant[] {
  const existingIds = new Set(existing.map((participant) => participant.id))
  const toAdd = contacts
    .filter((contact) => !existingIds.has(contact.id))
    .map(contactToParticipant)

  return toAdd.length > 0 ? [...existing, ...toAdd] : existing
}
