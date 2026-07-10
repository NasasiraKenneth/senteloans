import type { PoolClient } from "@/lib/db"
import type { ChatMessage } from "@/lib/chats/types"
import { mapMessageRow, type MessageRow } from "./map-message"

export const MESSAGE_SELECT_SQL = `SELECT
  m.id,
  m.conversation_id,
  m.sender_id,
  m.message_type::text AS message_type,
  COALESCE(m.visibility::text, 'PUBLIC') AS visibility,
  m.body,
  m.metadata,
  m.reply_to_message_id,
  m.forwarded_from_message_id,
  m.created_at,
  pm.pinned_at,
  (
    SELECT ma.file_name
      FROM message_attachments ma
     WHERE ma.message_id = m.id
     ORDER BY ma.uploaded_at ASC
     LIMIT 1
  ) AS attachment_name,
  (
    SELECT ma.file_url
      FROM message_attachments ma
     WHERE ma.message_id = m.id
     ORDER BY ma.uploaded_at ASC
     LIMIT 1
  ) AS attachment_url,
  COALESCE(u_fwd.full_name, mem_fwd.full_name, 'Unknown') AS forwarded_sender_name,
  src.body AS forwarded_body,
  src.message_type::text AS forwarded_type,
  (
    SELECT ma2.file_name
      FROM message_attachments ma2
     WHERE ma2.message_id = src.id
     ORDER BY ma2.uploaded_at ASC
     LIMIT 1
  ) AS forwarded_attachment_name
FROM messages m
LEFT JOIN pinned_messages pm
  ON pm.message_id = m.id
 AND pm.conversation_id = m.conversation_id
LEFT JOIN messages src
  ON src.id = m.forwarded_from_message_id
LEFT JOIN chat_identities ci_fwd
  ON ci_fwd.id = src.sender_id
LEFT JOIN users u_fwd
  ON u_fwd.id = ci_fwd.user_id
LEFT JOIN members mem_fwd
  ON mem_fwd.id = ci_fwd.member_id`

export async function loadMessageById(
  client: PoolClient,
  messageId: string,
): Promise<ChatMessage | null> {
  const res = await client.query(`${MESSAGE_SELECT_SQL} WHERE m.id = $1`, [messageId])
  if ((res.rowCount ?? 0) === 0) return null
  return mapMessageRow(res.rows[0] as MessageRow)
}

export async function loadSourceMessageSnapshot(
  client: PoolClient,
  messageId: string,
  conversationId: string,
): Promise<{
  id: string
  body: string
  messageType: string
  attachmentName?: string
  senderName: string
} | null> {
  const res = await client.query(
    `SELECT
       m.id,
       m.body,
       m.message_type::text AS message_type,
       (
         SELECT ma.file_name
           FROM message_attachments ma
          WHERE ma.message_id = m.id
          ORDER BY ma.uploaded_at ASC
          LIMIT 1
       ) AS attachment_name,
       COALESCE(u_sender.full_name, mem_sender.full_name, 'Unknown') AS sender_name
     FROM messages m
     LEFT JOIN chat_identities ci_sender ON ci_sender.id = m.sender_id
     LEFT JOIN users u_sender ON u_sender.id = ci_sender.user_id
     LEFT JOIN members mem_sender ON mem_sender.id = ci_sender.member_id
    WHERE m.id = $1
      AND m.conversation_id = $2
      AND m.is_deleted = FALSE
    LIMIT 1`,
    [messageId, conversationId],
  )

  if ((res.rowCount ?? 0) === 0) return null

  const row = res.rows[0]
  return {
    id: row.id as string,
    body: (row.body as string | null) ?? "",
    messageType: row.message_type as string,
    attachmentName: (row.attachment_name as string | null) ?? undefined,
    senderName: row.sender_name as string,
  }
}
