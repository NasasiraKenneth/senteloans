import type { PoolClient } from "@/lib/db"
import { ChatMessageError } from "./chat-message-error"

export type ConversationAccess = {
  conversationId: string
  institutionId: string
}

export async function requireConversationAccess(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
): Promise<ConversationAccess> {
  const res = await client.query(
    `SELECT c.id, c.institution_id
       FROM conversations c
      INNER JOIN conversation_participants cp
        ON cp.conversation_id = c.id
       AND cp.chat_identity_id = $2
       AND cp.left_at IS NULL
      WHERE c.id = $1
      LIMIT 1`,
    [conversationId, chatIdentityId],
  )

  if ((res.rowCount ?? 0) === 0) {
    throw new ChatMessageError("Conversation not found", "not_found")
  }

  return {
    conversationId: res.rows[0].id as string,
    institutionId: res.rows[0].institution_id as string,
  }
}
