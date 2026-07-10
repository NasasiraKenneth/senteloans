import type { PoolClient } from "@/lib/db"
import type {
  ChatMessage,
  MessageType,
  MessageVisibility,
  SendMessageResponse,
} from "@/lib/chats/types"
import { getMessagePreviewText } from "@/lib/chats/format"
import { ChatMessageError } from "./chat-message-error"
import { loadMessageById } from "./load-message"
import {
  getConversationParticipantIdentityIds,
  notifyConversationParticipants,
  notifyInboxParticipants,
} from "./notify-inbox"
import { requireConversationAccess } from "./conversation-access"
import {
  ensureStaffJoinedSupportConversation,
  getConversationStaffParticipantIdentityIds,
  listSupportQueueManagerIdentityIds,
} from "./support-access"

const ALLOWED_MESSAGE_TYPES: MessageType[] = ["TEXT", "IMAGE", "FILE", "AUDIO", "VIDEO"]

export type MessageAttachmentInput = {
  fileName: string
  fileUrl: string
  mimeType?: string
  fileSize?: number
  storageKey?: string
}

export type SendMessageInput = {
  conversationId: string
  senderChatIdentityId: string
  body: string
  messageType?: MessageType
  replyToMessageId?: string
  clientMessageId?: string
  forwardedFromMessageId?: string
  metadata?: Record<string, unknown>
  attachment?: MessageAttachmentInput
  visibility?: MessageVisibility
  hasManageSupportParticipants?: boolean
  /** When true, reject INTERNAL visibility (member senders). */
  publicMessagesOnly?: boolean
}

function resolveMessageType(
  messageType: MessageType,
  attachment?: MessageAttachmentInput,
): MessageType {
  if (!attachment) return messageType
  if (messageType !== "TEXT") return messageType
  const mime = (attachment.mimeType ?? "").toLowerCase()
  if (mime.startsWith("image/")) return "IMAGE"
  return "FILE"
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
  publicOnly: boolean,
): Promise<void> {
  const visibilitySql = publicOnly
    ? `AND COALESCE(visibility::text, 'PUBLIC') = 'PUBLIC'`
    : ""

  const res = await client.query(
    `SELECT 1 FROM messages
      WHERE id = $1
        AND conversation_id = $2
        AND is_deleted = FALSE
        ${visibilitySql}
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
    replyToMessageId,
    clientMessageId,
    forwardedFromMessageId,
    metadata = {},
    attachment,
    hasManageSupportParticipants = false,
    publicMessagesOnly = false,
  } = input

  const messageType = resolveMessageType(input.messageType ?? "TEXT", attachment)
  let visibility: MessageVisibility = input.visibility === "INTERNAL" ? "INTERNAL" : "PUBLIC"

  if (publicMessagesOnly && visibility === "INTERNAL") {
    throw new ChatMessageError("Internal notes are not allowed", "forbidden")
  }

  const access = await requireConversationAccess(client, conversationId, senderChatIdentityId, {
    hasManageSupportParticipants,
  })

  if (access.type !== "SUPPORT" && visibility === "INTERNAL") {
    visibility = "PUBLIC"
  }

  if (access.type === "SUPPORT" && !access.isParticipant) {
    if (!hasManageSupportParticipants) {
      throw new ChatMessageError("Conversation not found", "not_found")
    }
    await ensureStaffJoinedSupportConversation(client, conversationId, senderChatIdentityId)
  }

  const trimmedBody = body.trim()

  if (!ALLOWED_MESSAGE_TYPES.includes(messageType)) {
    throw new ChatMessageError("Unsupported message type", "invalid_request")
  }

  if (attachment) {
    if (!attachment.fileUrl?.trim() || !attachment.fileName?.trim()) {
      throw new ChatMessageError("Attachment fileUrl and fileName are required", "invalid_request")
    }
  }

  if (messageType === "TEXT" && !trimmedBody && !forwardedFromMessageId) {
    throw new ChatMessageError("Message body is required", "empty_body")
  }

  if ((messageType === "IMAGE" || messageType === "FILE") && !attachment && !forwardedFromMessageId) {
    throw new ChatMessageError("Attachment is required for this message type", "invalid_request")
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
    await validateReplyTarget(client, conversationId, replyToMessageId, publicMessagesOnly)
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
    attachmentName: attachment?.fileName,
    attachmentUrl: attachment?.fileUrl,
    forwardedFrom: metadata.forwardSnapshot as ChatMessage["forwardedFrom"],
    visibility,
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
         visibility,
         body,
         metadata,
         client_message_id,
         reply_to_message_id,
         forwarded_from_message_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
       RETURNING id, created_at`,
      [
        conversationId,
        access.institutionId,
        senderChatIdentityId,
        messageType,
        visibility,
        trimmedBody || null,
        JSON.stringify(metadata),
        clientMessageId ?? null,
        replyToMessageId ?? null,
        forwardedFromMessageId ?? null,
      ],
    )

    const messageId = insertRes.rows[0].id as string
    const messageCreatedAt = insertRes.rows[0].created_at as string

    if (attachment) {
      await client.query(
        `INSERT INTO message_attachments (
           message_id,
           file_name,
           file_url,
           mime_type,
           file_size,
           storage_key
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          messageId,
          attachment.fileName.trim(),
          attachment.fileUrl.trim(),
          attachment.mimeType ?? null,
          attachment.fileSize ?? null,
          attachment.storageKey ?? null,
        ],
      )
    }

    if (visibility === "PUBLIC") {
      await client.query(
        `UPDATE conversations
            SET last_message_id = $2,
                last_message_at = $3,
                last_message_preview = $4,
                updated_at = NOW(),
                support_status = CASE
                  WHEN type = 'SUPPORT' AND support_status IS NULL THEN 'OPEN'::support_ticket_status
                  WHEN type = 'SUPPORT' AND support_status = 'RESOLVED' THEN 'OPEN'::support_ticket_status
                  WHEN type = 'SUPPORT' AND support_status = 'CLOSED' THEN 'OPEN'::support_ticket_status
                  ELSE support_status
                END
          WHERE id = $1`,
        [conversationId, messageId, messageCreatedAt, previewText],
      )
    } else {
      await client.query(
        `UPDATE conversations
            SET updated_at = NOW()
          WHERE id = $1`,
        [conversationId],
      )
    }

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

    if (visibility === "INTERNAL") {
      const staffIds = await getConversationStaffParticipantIdentityIds(client, conversationId)
      const queueIds = await listSupportQueueManagerIdentityIds(
        client,
        access.institutionId,
        access.branchId,
      )
      const notifyIds = [...new Set([...staffIds, ...queueIds])]
      await notifyConversationParticipants(notifyIds, {
        type: "message:new",
        conversationId,
        message,
      })
    } else {
      const participantIds = await getConversationParticipantIdentityIds(client, conversationId)
      const queueIds =
        access.type === "SUPPORT"
          ? await listSupportQueueManagerIdentityIds(
              client,
              access.institutionId,
              access.branchId,
            )
          : []
      const notifyIds = [...new Set([...participantIds, ...queueIds])]
      await notifyConversationParticipants(notifyIds, {
        type: "message:new",
        conversationId,
        message,
      })
      if (queueIds.length > 0) {
        await notifyInboxParticipants(queueIds)
      }
    }

    return { ok: true, message }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
