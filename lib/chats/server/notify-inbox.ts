import type { PoolClient } from "@/lib/db"
import { invalidateInboxCaches } from "@/lib/chats/redis/inbox-cache"
import { publishInboxInvalidate, publishThreadEvent, type ThreadEvent } from "@/lib/chats/redis/pubsub"

export async function notifyInboxParticipants(chatIdentityIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(chatIdentityIds.filter(Boolean))]
  if (uniqueIds.length === 0) return

  await invalidateInboxCaches(uniqueIds)
  await Promise.all(uniqueIds.map((id) => publishInboxInvalidate(id)))
}

export async function notifyConversationParticipants(
  chatIdentityIds: string[],
  threadEvent: Omit<Extract<ThreadEvent, { type: "message:new" }>, "at">
    | Omit<Extract<ThreadEvent, { type: "message:updated" }>, "at">
    | Omit<Extract<ThreadEvent, { type: "participants:added" }>, "at">
    | Omit<Extract<ThreadEvent, { type: "conversation:read" }>, "at">,
): Promise<void> {
  await notifyInboxParticipants(chatIdentityIds)
  await publishThreadEvent(threadEvent.conversationId, threadEvent as Omit<ThreadEvent, "at">)
}

export async function getConversationParticipantIdentityIds(
  client: PoolClient,
  conversationId: string,
): Promise<string[]> {
  const res = await client.query(
    `SELECT chat_identity_id
       FROM conversation_participants
      WHERE conversation_id = $1
        AND left_at IS NULL`,
    [conversationId],
  )

  return res.rows.map((row) => row.chat_identity_id as string)
}
