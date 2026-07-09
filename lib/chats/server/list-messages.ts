import type { PoolClient } from "@/lib/db"
import type { ChatMessage, ListMessagesResponse } from "@/lib/chats/types"
import { toIlikePattern } from "./inbox-query"
import { mapMessageRow, type MessageRow } from "./map-message"
import { markConversationRead } from "./mark-conversation-read"
import { requireConversationAccess } from "./conversation-access"

export type ListMessagesQuery = {
  limit?: number
  before?: string
  after?: string
  search?: string
  markRead?: boolean
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const MESSAGE_SELECT_SQL = `SELECT
  m.id,
  m.conversation_id,
  m.sender_id,
  m.message_type::text AS message_type,
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

function normalizeLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT)
}

export async function listMessages(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
  query: ListMessagesQuery = {},
): Promise<ListMessagesResponse> {
  await requireConversationAccess(client, conversationId, chatIdentityId)

  const limit = normalizeLimit(query.limit)
  const searchPattern = toIlikePattern(query.search ?? "")
  const markRead = query.markRead ?? !query.before

  const params: unknown[] = [conversationId]
  let paramIndex = 2

  let cursorSql = ""
  if (query.before) {
    cursorSql = `AND m.created_at < (
      SELECT created_at FROM messages WHERE id = $${paramIndex} AND conversation_id = $1
    )`
    params.push(query.before)
    paramIndex += 1
  } else if (query.after) {
    cursorSql = `AND m.created_at > (
      SELECT created_at FROM messages WHERE id = $${paramIndex} AND conversation_id = $1
    )`
    params.push(query.after)
    paramIndex += 1
  }

  let searchSql = ""
  if (searchPattern) {
    searchSql = `AND COALESCE(m.body, '') ILIKE $${paramIndex}`
    params.push(searchPattern)
    paramIndex += 1
  }

  params.push(limit + 1)
  const limitParam = `$${paramIndex}`

  const res = await client.query(
    `${MESSAGE_SELECT_SQL}
WHERE m.conversation_id = $1
  AND m.is_deleted = FALSE
  ${cursorSql}
  ${searchSql}
ORDER BY m.created_at DESC
LIMIT ${limitParam}`,
    params,
  )

  const rows = res.rows as MessageRow[]
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const messages: ChatMessage[] = pageRows.map(mapMessageRow).reverse()

  if (markRead && !query.search) {
    await markConversationRead(client, conversationId, chatIdentityId)
  }

  return {
    ok: true,
    messages,
    hasMore,
  }
}
