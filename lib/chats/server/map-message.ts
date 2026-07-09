import type { ChatMessage, ForwardedMessageMeta, MessageType } from "@/lib/chats/types"

export type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  message_type: MessageType
  body: string | null
  metadata: Record<string, unknown> | null
  reply_to_message_id: string | null
  forwarded_from_message_id: string | null
  created_at: string | Date
  pinned_at?: string | Date | null
  attachment_name?: string | null
  forwarded_sender_name?: string | null
  forwarded_body?: string | null
  forwarded_type?: MessageType | null
  forwarded_attachment_name?: string | null
}

function parseForwardSnapshot(metadata: Record<string, unknown> | null): ForwardedMessageMeta | null {
  const snapshot = metadata?.forwardSnapshot
  if (!snapshot || typeof snapshot !== "object") return null

  const value = snapshot as Record<string, unknown>
  const senderName = typeof value.senderName === "string" ? value.senderName : ""
  const body = typeof value.body === "string" ? value.body : ""
  const type = typeof value.messageType === "string" ? (value.messageType as MessageType) : "TEXT"
  const attachmentName =
    typeof value.attachmentName === "string" ? value.attachmentName : undefined

  if (!senderName && !body) return null

  return { senderName, body, type, attachmentName }
}

function resolveForwardedFrom(row: MessageRow): ForwardedMessageMeta | undefined {
  const fromMetadata = parseForwardSnapshot(row.metadata)
  if (fromMetadata) return fromMetadata

  if (!row.forwarded_from_message_id) return undefined

  const senderName = row.forwarded_sender_name?.trim()
  const body = row.forwarded_body ?? ""
  const type = row.forwarded_type ?? "TEXT"

  if (!senderName && !body) return undefined

  return {
    senderName: senderName || "Unknown",
    body,
    type,
    attachmentName: row.forwarded_attachment_name ?? undefined,
  }
}

export function mapMessageRow(row: MessageRow): ChatMessage {
  const forwardedFrom = resolveForwardedFrom(row)

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    type: row.message_type,
    body: row.body ?? "",
    sentAt: new Date(row.created_at).toISOString(),
    pinned: Boolean(row.pinned_at),
    pinnedAt: row.pinned_at ? new Date(row.pinned_at).toISOString() : undefined,
    replyToId: row.reply_to_message_id ?? undefined,
    attachmentName: row.attachment_name ?? undefined,
    forwardedFrom,
    forwardedFromMessageId: row.forwarded_from_message_id ?? undefined,
  }
}
