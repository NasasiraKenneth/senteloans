export type ConversationType =
  | "DIRECT"
  | "GROUP"
  | "COMMITTEE"
  | "LOAN"
  | "BRANCH"
  | "SUPPORT"

export type MessageType = "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO" | "SYSTEM"

export type ChatParticipant = {
  id: string
  name: string
  role: "staff" | "member"
  /** Institution member record id — links to /members/[id] for staff UI */
  memberId?: string
  avatarUrl?: string
  isOnline?: boolean
  subtitle?: string
}

export type ForwardedMessageMeta = {
  senderName: string
  body: string
  type: MessageType
  attachmentName?: string
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  type: MessageType
  body: string
  sentAt: string
  readAt?: string
  pinned?: boolean
  pinnedAt?: string
  replyToId?: string
  attachmentName?: string
  forwardedFrom?: ForwardedMessageMeta
  forwardedFromMessageId?: string
}

export type ConversationReference = {
  type: "LOAN" | "MEMBER" | "BRANCH"
  label: string
  id: string
}

export type ChatConversation = {
  id: string
  type: ConversationType
  title: string
  participants: ChatParticipant[]
  lastMessage?: {
    body: string
    sentAt: string
    senderId: string
    type: MessageType
  }
  unreadCount: number
  /** From conversations.latest_pinned_at — inbox pinned section when set */
  latestPinnedAt?: string | null
  reference?: ConversationReference
  messages: ChatMessage[]
}

export type ChatContact = {
  id: string
  name: string
  role: "staff" | "member"
  memberId?: string
  subtitle?: string
}

export type ChatInboxResponse = {
  ok: true
  currentIdentityId: string
  conversations: ChatConversation[]
  totalUnread: number
}

export type ChatContactsResponse = {
  ok: true
  contacts: ChatContact[]
}

export type CreateConversationResponse = {
  ok: true
  conversation: ChatConversation
  created: boolean
}

export type CreateGroupResponse = {
  ok: true
  conversation: ChatConversation
}

export type ConversationFilter = "all" | ConversationType

export type ListMessagesResponse = {
  ok: true
  messages: ChatMessage[]
  hasMore: boolean
}

export type SendMessageResponse = {
  ok: true
  message: ChatMessage
}

export type TogglePinResponse = {
  ok: true
  message: ChatMessage
  latestPinnedAt: string | null
}

export type ForwardMessagesResponse = {
  ok: true
  results: Array<{ conversationId: string; message: ChatMessage }>
}

export type AddParticipantsResponse = {
  ok: true
  conversation: ChatConversation
  systemMessageId: string
}
