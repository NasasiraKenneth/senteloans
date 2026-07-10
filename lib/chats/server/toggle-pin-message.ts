import type { PoolClient } from "@/lib/db"
import type { ChatMessage } from "@/lib/chats/types"
import { ChatMessageError } from "./chat-message-error"
import { loadMessageById } from "./load-message"
import { requireConversationAccess } from "./conversation-access"
import {
  getConversationParticipantIdentityIds,
  notifyConversationParticipants,
} from "./notify-inbox"

export type TogglePinResponse = {
  ok: true
  message: ChatMessage
  latestPinnedAt: string | null
}

async function refreshLatestPinnedAt(
  client: PoolClient,
  conversationId: string,
): Promise<string | null> {
  const res = await client.query(
    `UPDATE conversations c
        SET latest_pinned_at = sub.latest_pinned_at,
            updated_at = NOW()
       FROM (
         SELECT MAX(pinned_at) AS latest_pinned_at
           FROM pinned_messages
          WHERE conversation_id = $1
       ) sub
      WHERE c.id = $1
      RETURNING c.latest_pinned_at`,
    [conversationId],
  )

  const value = res.rows[0]?.latest_pinned_at
  return value ? new Date(value).toISOString() : null
}

export async function togglePinMessage(
  client: PoolClient,
  conversationId: string,
  messageId: string,
  chatIdentityId: string,
  options?: { hasManageSupportParticipants?: boolean },
): Promise<TogglePinResponse> {
  await requireConversationAccess(client, conversationId, chatIdentityId, {
    hasManageSupportParticipants: options?.hasManageSupportParticipants,
  })

  const messageRes = await client.query(
    `SELECT id, message_type::text AS message_type
       FROM messages
      WHERE id = $1
        AND conversation_id = $2
        AND is_deleted = FALSE
      LIMIT 1`,
    [messageId, conversationId],
  )

  if ((messageRes.rowCount ?? 0) === 0) {
    throw new ChatMessageError("Message not found", "not_found")
  }

  if (messageRes.rows[0].message_type === "SYSTEM") {
    throw new ChatMessageError("System messages cannot be pinned", "invalid_request")
  }

  const pinnedRes = await client.query(
    `SELECT 1
       FROM pinned_messages
      WHERE conversation_id = $1
        AND message_id = $2
      LIMIT 1`,
    [conversationId, messageId],
  )

  const isPinned = (pinnedRes.rowCount ?? 0) > 0

  await client.query("BEGIN")

  try {
    if (isPinned) {
      await client.query(
        `DELETE FROM pinned_messages
          WHERE conversation_id = $1
            AND message_id = $2`,
        [conversationId, messageId],
      )
    } else {
      await client.query(
        `INSERT INTO pinned_messages (conversation_id, message_id, pinned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (conversation_id, message_id) DO NOTHING`,
        [conversationId, messageId, chatIdentityId],
      )
    }

    const latestPinnedAt = await refreshLatestPinnedAt(client, conversationId)
    await client.query("COMMIT")

    const message = await loadMessageById(client, messageId)
    if (!message) {
      throw new Error("pin_toggle_failed")
    }

    const participantIds = await getConversationParticipantIdentityIds(client, conversationId)
    await notifyConversationParticipants(participantIds, {
      type: "message:updated",
      conversationId,
      message,
      latestPinnedAt,
    })

    return { ok: true, message, latestPinnedAt }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
