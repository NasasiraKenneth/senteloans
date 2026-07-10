import type { PoolClient } from "@/lib/db"
import type { ChatMessage, ListMessagesResponse } from "@/lib/chats/types"
import { toIlikePattern } from "./inbox-query"
import { mapMessageRow, type MessageRow } from "./map-message"
import { markConversationRead } from "./mark-conversation-read"
import { requireConversationAccess } from "./conversation-access"
import { MESSAGE_SELECT_SQL } from "./load-message"

export type ListMessagesQuery = {
  limit?: number
  before?: string
  after?: string
  search?: string
  markRead?: boolean
  /** Members only see PUBLIC messages */
  publicMessagesOnly?: boolean
  hasManageSupportParticipants?: boolean
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

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
  await requireConversationAccess(client, conversationId, chatIdentityId, {
    hasManageSupportParticipants: query.hasManageSupportParticipants,
  })

  const limit = normalizeLimit(query.limit)
  const searchPattern = toIlikePattern(query.search ?? "")
  const markRead = query.markRead ?? !query.before
  const publicOnly = query.publicMessagesOnly === true

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

  const visibilitySql = publicOnly
    ? `AND COALESCE(m.visibility::text, 'PUBLIC') = 'PUBLIC'`
    : ""

  params.push(limit + 1)
  const limitParam = `$${paramIndex}`

  const res = await client.query(
    `${MESSAGE_SELECT_SQL}
WHERE m.conversation_id = $1
  AND m.is_deleted = FALSE
  ${visibilitySql}
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
