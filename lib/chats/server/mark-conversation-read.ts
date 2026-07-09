import type { PoolClient } from "@/lib/db"

export async function markConversationRead(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
): Promise<void> {
  await client.query(
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
        AND cp.left_at IS NULL`,
    [conversationId, chatIdentityId],
  )
}
