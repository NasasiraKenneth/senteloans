import type { PoolClient } from "@/lib/db"
import {
  getConversationParticipantIdentityIds,
  notifyConversationParticipants,
  notifyInboxParticipants,
} from "./notify-inbox"
import { listSupportQueueManagerIdentityIds } from "./support-access"

export type MarkConversationReadResult = {
  lastReadMessageId: string | null
  readAt: string | null
}

export async function markConversationRead(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
): Promise<MarkConversationReadResult> {
  const res = await client.query<{ id: string; read_at: Date }>(
    `UPDATE conversation_participants cp
        SET last_read_message_id = latest.id,
            last_read_at = NOW()
       FROM (
         SELECT id
           FROM messages
          WHERE conversation_id = $1
            AND is_deleted = FALSE
          ORDER BY created_at DESC
          LIMIT 1
       ) latest
      WHERE cp.conversation_id = $1
        AND cp.chat_identity_id = $2
        AND cp.left_at IS NULL
        AND (cp.last_read_message_id IS DISTINCT FROM latest.id)
      RETURNING cp.last_read_message_id AS id, cp.last_read_at AS read_at`,
    [conversationId, chatIdentityId],
  )

  const row = res.rows[0]
  if (!row) {
    return { lastReadMessageId: null, readAt: null }
  }

  return {
    lastReadMessageId: row.id,
    readAt: new Date(row.read_at).toISOString(),
  }
}

/**
 * Mark conversation read and notify peers (inbox unread + blue-tick receipts).
 */
export async function markConversationReadAndNotify(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
  options?: {
    institutionId?: string
    branchId?: string | null
    conversationType?: string
  },
): Promise<MarkConversationReadResult> {
  const result = await markConversationRead(client, conversationId, chatIdentityId)
  if (!result.lastReadMessageId || !result.readAt) return result

  const participantIds = await getConversationParticipantIdentityIds(client, conversationId)
  let notifyIds = participantIds

  if (options?.conversationType === "SUPPORT" && options.institutionId) {
    const queueIds = await listSupportQueueManagerIdentityIds(
      client,
      options.institutionId,
      options.branchId ?? null,
    )
    notifyIds = [...new Set([...participantIds, ...queueIds])]
  }

  const peerIds = notifyIds.filter((id) => id !== chatIdentityId)

  await notifyConversationParticipants(peerIds.length > 0 ? peerIds : notifyIds, {
    type: "conversation:read",
    conversationId,
    readerChatIdentityId: chatIdentityId,
    lastReadMessageId: result.lastReadMessageId,
    readAt: result.readAt,
  })

  // Ensure the reader's own inbox badge clears even if they weren't in peerIds.
  await notifyInboxParticipants([chatIdentityId, ...peerIds])

  return result
}
