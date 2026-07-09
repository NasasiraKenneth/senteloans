import type { PoolClient } from "@/lib/db"
import type { ChatConversation, ChatParticipant } from "@/lib/chats/types"
import {
  mapParticipantRow,
  mapReferenceRow,
  resolveConversationDisplayTitle,
  type ConversationRow,
  type ParticipantRow,
  type ReferenceRow,
} from "./map-conversation"

const PARTICIPANTS_SQL = `SELECT
   cp.conversation_id,
   ci.id AS chat_identity_id,
   ci.is_system,
   COALESCE(u.full_name, m.full_name, 'System') AS display_name,
   CASE
     WHEN ci.is_system THEN 'staff'
     WHEN ci.user_id IS NOT NULL THEN 'staff'
     ELSE 'member'
   END AS role,
   m.id AS member_id,
   m.member_number,
   b.name AS branch_name,
   r.name AS staff_role_name
 FROM conversation_participants cp
 INNER JOIN chat_identities ci ON ci.id = cp.chat_identity_id
 LEFT JOIN users u ON u.id = ci.user_id
 LEFT JOIN members m ON m.id = ci.member_id
 LEFT JOIN branches b ON b.id = COALESCE(m.branch_id, u.branch_id)
 LEFT JOIN roles r ON r.id = u.role_id
WHERE cp.conversation_id = ANY($1::uuid[])
  AND cp.left_at IS NULL
  AND ci.is_system = FALSE
ORDER BY cp.joined_at ASC`

const REFERENCES_SQL = `SELECT
   cr.conversation_id,
   cr.reference_type::text AS reference_type,
   cr.reference_id,
   CASE
     WHEN cr.reference_type = 'LOAN' THEN l.application_id
     WHEN cr.reference_type = 'BRANCH' THEN br.name
     WHEN cr.reference_type = 'MEMBER' THEN mem.full_name
     ELSE NULL
   END AS reference_label
 FROM conversation_references cr
 LEFT JOIN loans l
   ON cr.reference_type = 'LOAN'
  AND l.id = cr.reference_id
 LEFT JOIN branches br
   ON cr.reference_type = 'BRANCH'
  AND br.id = cr.reference_id
 LEFT JOIN members mem
   ON cr.reference_type = 'MEMBER'
  AND mem.id = cr.reference_id
WHERE cr.conversation_id = ANY($1::uuid[])`

function mapConversationRow(
  row: ConversationRow,
  participants: ChatParticipant[],
  reference: ReturnType<typeof mapReferenceRow>,
  currentIdentityId: string,
): ChatConversation {
  return {
    id: row.id,
    type: row.type,
    title: resolveConversationDisplayTitle(row, participants, currentIdentityId),
    participants,
    unreadCount: row.unread_count ?? 0,
    latestPinnedAt: row.latest_pinned_at,
    reference,
    messages: [],
    lastMessage:
      row.last_message_at && row.last_message_preview
        ? {
            body: row.last_message_preview,
            sentAt: new Date(row.last_message_at).toISOString(),
            senderId: row.last_message_sender_id ?? "system",
            type: row.last_message_type ?? "TEXT",
          }
        : undefined,
  }
}

export async function loadConversationRows(
  client: PoolClient,
  conversationIds: string[],
  currentIdentityId: string,
): Promise<ChatConversation[]> {
  if (conversationIds.length === 0) return []

  const rowsRes = await client.query(
    `SELECT
       c.id,
       c.type::text AS type,
       c.title,
       c.last_message_at,
       c.last_message_preview,
       c.latest_pinned_at,
       lm.sender_id AS last_message_sender_id,
       lm.message_type::text AS last_message_type,
       (
         SELECT COUNT(*)::int
           FROM messages msg
          WHERE msg.conversation_id = c.id
            AND msg.is_deleted = FALSE
            AND msg.sender_id <> $2
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
      AND cp.chat_identity_id = $2
      AND cp.left_at IS NULL
     LEFT JOIN messages lm ON lm.id = c.last_message_id
    WHERE c.id = ANY($1::uuid[])`,
    [conversationIds, currentIdentityId],
  )

  const [participantsRes, referencesRes] = await Promise.all([
    client.query(PARTICIPANTS_SQL, [conversationIds]),
    client.query(REFERENCES_SQL, [conversationIds]),
  ])

  const participantsByConversation = new Map<string, ChatParticipant[]>()
  for (const row of participantsRes.rows as ParticipantRow[]) {
    const list = participantsByConversation.get(row.conversation_id) ?? []
    list.push(mapParticipantRow(row))
    participantsByConversation.set(row.conversation_id, list)
  }

  const referencesByConversation = new Map<string, ReturnType<typeof mapReferenceRow>>()
  for (const row of referencesRes.rows as ReferenceRow[]) {
    const reference = mapReferenceRow(row)
    if (reference) referencesByConversation.set(row.conversation_id, reference)
  }

  return conversationIds
    .map((conversationId) => {
      const row = (rowsRes.rows as ConversationRow[]).find((item) => item.id === conversationId)
      if (!row) return null
      return mapConversationRow(
        row,
        participantsByConversation.get(row.id) ?? [],
        referencesByConversation.get(row.id),
        currentIdentityId,
      )
    })
    .filter((conversation): conversation is ChatConversation => conversation !== null)
}

export async function fetchConversationById(
  client: PoolClient,
  conversationId: string,
  currentIdentityId: string,
  institutionId: string,
): Promise<ChatConversation | null> {
  const access = await client.query(
    `SELECT 1
       FROM conversation_participants cp
       INNER JOIN conversations c ON c.id = cp.conversation_id
      WHERE cp.conversation_id = $1
        AND cp.chat_identity_id = $2
        AND cp.left_at IS NULL
        AND c.institution_id = $3
      LIMIT 1`,
    [conversationId, currentIdentityId, institutionId],
  )
  if ((access.rowCount ?? 0) === 0) return null

  const conversations = await loadConversationRows(client, [conversationId], currentIdentityId)
  return conversations[0] ?? null
}
