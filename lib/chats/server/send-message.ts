import type { PoolClient } from "@/lib/db"
import type { ChatMessage, MessageType, SendMessageResponse } from "@/lib/chats/types"
import { getMessagePreviewText } from "@/lib/chats/format"
import { ChatMessageError } from "./chat-message-error"
import { loadMessageById } from "./load-message"
import {
  getConversationParticipantIdentityIds,
  notifyConversationParticipants,
} from "./notify-inbox"
import { requireConversationAccess } from "./conversation-access"

const ALLOWED_MESSAGE_TYPES: MessageType[] = ["TEXT", "IMAGE", "FILE", "AUDIO", "VIDEO"]

export type SendMessageInput = {
  conversationId: string
  senderChatIdentityId: string
  body: string
  messageType?: MessageType
  replyToMessageId?: string
  clientMessageId?: string
  forwardedFromMessageId?: string
  metadata?: Record<string, unknown>
}

async function findIdempotentMessage(
  client: PoolClient,
  conversationId: string,
  senderChatIdentityId: string,
  clientMessageId: string,
): Promise<ChatMessage | null> {
  const res = await client.query(
    `SELECT id FROM messages
      WHERE conversation_id = $1
        AND sender_id = $2
        AND client_message_id = $3
      LIMIT 1`,
    [conversationId, senderChatIdentityId, clientMessageId],
  )

  const existingId = res.rows[0]?.id as string | undefined
  if (!existingId) return null
  return loadMessageById(client, existingId)
}

async function validateReplyTarget(
  client: PoolClient,
  conversationId: string,
  replyToMessageId: string,
): Promise<void> {
  const res = await client.query(
    `SELECT 1 FROM messages
      WHERE id = $1
        AND conversation_id = $2
        AND is_deleted = FALSE
      LIMIT 1`,
    [replyToMessageId, conversationId],
  )

  if ((res.rowCount ?? 0) === 0) {
    throw new ChatMessageError("Reply target not found in this conversation", "invalid_reply")
  }
}

export async function sendMessage(
  client: PoolClient,
  input: SendMessageInput,
): Promise<SendMessageResponse> {
  const {
    conversationId,
    senderChatIdentityId,
    body,
    messageType = "TEXT",
    replyToMessageId,
    clientMessageId,
    forwardedFromMessageId,
    metadata = {},
  } = input

  const access = await requireConversationAccess(client, conversationId, senderChatIdentityId)
  const trimmedBody = body.trim()

  if (!ALLOWED_MESSAGE_TYPES.includes(messageType)) {
    throw new ChatMessageError("Unsupported message type", "invalid_request")
  }

  if (messageType === "TEXT" && !trimmedBody && !forwardedFromMessageId) {
    throw new ChatMessageError("Message body is required", "empty_body")
  }

  if (clientMessageId) {
    const existing = await findIdempotentMessage(
      client,
      conversationId,
      senderChatIdentityId,
      clientMessageId,
    )
    if (existing) {
      return { ok: true, message: existing }
    }
  }

  if (replyToMessageId) {
    await validateReplyTarget(client, conversationId, replyToMessageId)
  }

  const previewMessage: ChatMessage = {
    id: "preview",
    conversationId,
    senderId: senderChatIdentityId,
    type: messageType,
    body: trimmedBody,
    sentAt: new Date().toISOString(),
    replyToId: replyToMessageId,
    forwardedFromMessageId,
    forwardedFrom: metadata.forwardSnapshot as ChatMessage["forwardedFrom"],
  }
  const previewText = getMessagePreviewText(previewMessage)

  await client.query("BEGIN")

  try {
    const insertRes = await client.query(
      `INSERT INTO messages (
         conversation_id,
         institution_id,
         sender_id,
         message_type,
         body,
         metadata,
         client_message_id,
         reply_to_message_id,
         forwarded_from_message_id
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING id, created_at`,
      [
        conversationId,
        access.institutionId,
        senderChatIdentityId,
        messageType,
        trimmedBody || null,
        JSON.stringify(metadata),
        clientMessageId ?? null,
        replyToMessageId ?? null,
        forwardedFromMessageId ?? null,
      ],
    )

    const messageId = insertRes.rows[0].id as string
    const messageCreatedAt = insertRes.rows[0].created_at as string

    await client.query(
      `UPDATE conversations
          SET last_message_id = $2,
              last_message_at = $3,
              last_message_preview = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [conversationId, messageId, messageCreatedAt, previewText],
    )

    await client.query(
      `UPDATE conversation_participants
          SET last_read_message_id = $3,
              last_read_at = NOW()
        WHERE conversation_id = $1
          AND chat_identity_id = $2
          AND left_at IS NULL`,
      [conversationId, senderChatIdentityId, messageId],
    )

    await client.query("COMMIT")

    const message = await loadMessageById(client, messageId)
    if (!message) {
      throw new Error("message_send_failed")
    }

    const participantIds = await getConversationParticipantIdentityIds(client, conversationId)
    await notifyConversationParticipants(participantIds, {
      type: "message:new",
      conversationId,
      message,
    })

    return { ok: true, message }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
