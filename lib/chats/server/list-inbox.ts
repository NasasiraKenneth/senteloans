import type { PoolClient } from "@/lib/db"
import type { ChatInboxResponse } from "@/lib/chats/types"
import { loadConversationRows } from "./fetch-conversation"
import {
  inboxFilterSql,
  toIlikePattern,
  type InboxQuery,
} from "./inbox-query"

const INBOX_SEARCH_SQL = `(
  $4::text = ''
  OR COALESCE(c.title, '') ILIKE $4
  OR COALESCE(c.last_message_preview, '') ILIKE $4
  OR EXISTS (
    SELECT 1
      FROM conversation_participants cp_search
     INNER JOIN chat_identities ci_search ON ci_search.id = cp_search.chat_identity_id
      LEFT JOIN users u_search ON u_search.id = ci_search.user_id
      LEFT JOIN members m_search ON m_search.id = ci_search.member_id
     WHERE cp_search.conversation_id = c.id
       AND cp_search.left_at IS NULL
       AND ci_search.is_system = FALSE
       AND COALESCE(u_search.full_name, m_search.full_name, '') ILIKE $4
  )
  OR EXISTS (
    SELECT 1
      FROM conversation_references cr_search
      LEFT JOIN loans l_search
        ON cr_search.reference_type = 'LOAN'
       AND l_search.id = cr_search.reference_id
      LEFT JOIN branches br_search
        ON cr_search.reference_type = 'BRANCH'
       AND br_search.id = cr_search.reference_id
      LEFT JOIN members mem_search
        ON cr_search.reference_type = 'MEMBER'
       AND mem_search.id = cr_search.reference_id
     WHERE cr_search.conversation_id = c.id
       AND (
         COALESCE(l_search.application_id, '') ILIKE $4
         OR COALESCE(br_search.name, '') ILIKE $4
         OR COALESCE(mem_search.full_name, '') ILIKE $4
       )
  )
)`

async function getTotalUnread(
  client: PoolClient,
  chatIdentityId: string,
): Promise<number> {
  const res = await client.query(
    `SELECT COALESCE(SUM(unread_count), 0)::int AS total_unread
       FROM (
         SELECT (
           SELECT COUNT(*)::int
             FROM messages msg
            WHERE msg.conversation_id = c.id
              AND msg.is_deleted = FALSE
              AND msg.sender_id <> $1
              AND (
                cp.last_read_message_id IS NULL
                OR msg.created_at > (
                  SELECT m2.created_at
                    FROM messages m2
                   WHERE m2.id = cp.last_read_message_id
                )
              )
         ) AS unread_count
           FROM conversations c
          INNER JOIN conversation_participants cp
             ON cp.conversation_id = c.id
            AND cp.chat_identity_id = $1
            AND cp.left_at IS NULL
       ) unread_counts`,
    [chatIdentityId],
  )

  return res.rows[0]?.total_unread ?? 0
}

export async function listInboxConversations(
  client: PoolClient,
  chatIdentityId: string,
  institutionId: string,
  query: InboxQuery = {},
): Promise<ChatInboxResponse> {
  const filter = query.filter ?? "all"
  const filterType = inboxFilterSql(filter)
  const searchPattern = toIlikePattern(query.search ?? "")

  const conversationsRes = await client.query(
    `SELECT c.id
       FROM conversations c
       INNER JOIN conversation_participants cp
         ON cp.conversation_id = c.id
        AND cp.chat_identity_id = $1
        AND cp.left_at IS NULL
      WHERE c.institution_id = $2
        AND ($3::text IS NULL OR c.type::text = $3)
        AND ${INBOX_SEARCH_SQL}
      ORDER BY
        c.latest_pinned_at DESC NULLS LAST,
        COALESCE(c.last_message_at, c.updated_at) DESC
      LIMIT 100`,
    [chatIdentityId, institutionId, filterType, searchPattern],
  )

  const conversationIds = conversationsRes.rows.map((row) => row.id as string)
  const [conversations, totalUnread] = await Promise.all([
    loadConversationRows(client, conversationIds, chatIdentityId),
    getTotalUnread(client, chatIdentityId),
  ])

  return {
    ok: true,
    currentIdentityId: chatIdentityId,
    conversations,
    totalUnread,
  }
}
