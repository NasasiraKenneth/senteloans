import type { PoolClient } from "@/lib/db"
import type { ChatConversation } from "@/lib/chats/types"
import { ChatConversationError } from "./create-conversation"
import { fetchConversationById } from "./fetch-conversation"
import {
  getConversationParticipantIdentityIds,
  notifyConversationParticipants,
} from "./notify-inbox"
import { loadMessageById } from "./load-message"
import { requireConversationAccess } from "./conversation-access"

export type AddParticipantsInput = {
  conversationId: string
  actorChatIdentityId: string
  participantChatIdentityIds: string[]
  systemIdentityId: string
  actorDisplayName?: string
}

export type AddParticipantsResponse = {
  ok: true
  conversation: ChatConversation
  systemMessageId: string
}

function formatParticipantsAddedBody(
  addedNames: string[],
  addedByName: string,
): string {
  if (addedNames.length === 1) {
    return `${addedByName} added ${addedNames[0]}`
  }

  return `${addedByName} added ${addedNames.slice(0, -1).join(", ")} and ${addedNames[addedNames.length - 1]}`
}

export async function addConversationParticipants(
  client: PoolClient,
  input: AddParticipantsInput,
): Promise<AddParticipantsResponse> {
  const {
    conversationId,
    actorChatIdentityId,
    participantChatIdentityIds,
    systemIdentityId,
    actorDisplayName = "Someone",
  } = input

  const access = await requireConversationAccess(client, conversationId, actorChatIdentityId)

  let resolvedActorName = actorDisplayName
  if (!resolvedActorName || resolvedActorName === "Someone") {
    const actorNameRes = await client.query(
      `SELECT COALESCE(u.full_name, m.full_name, 'Someone') AS display_name
         FROM chat_identities ci
         LEFT JOIN users u ON u.id = ci.user_id
         LEFT JOIN members m ON m.id = ci.member_id
        WHERE ci.id = $1
        LIMIT 1`,
      [actorChatIdentityId],
    )
    resolvedActorName = (actorNameRes.rows[0]?.display_name as string | undefined) ?? "Someone"
  }

  const conversationTypeRes = await client.query(
    `SELECT type::text AS type FROM conversations WHERE id = $1 LIMIT 1`,
    [conversationId],
  )
  const conversationType = conversationTypeRes.rows[0]?.type as string | undefined

  if (conversationType === "DIRECT") {
    throw new ChatConversationError(
      "Cannot add participants to a direct conversation",
      "invalid_participants",
    )
  }

  const existingRes = await client.query(
    `SELECT chat_identity_id
       FROM conversation_participants
      WHERE conversation_id = $1
        AND left_at IS NULL`,
    [conversationId],
  )
  const existingIds = new Set(
    existingRes.rows.map((row) => row.chat_identity_id as string),
  )

  const uniqueIds = [...new Set(participantChatIdentityIds.filter(Boolean))].filter(
    (id) => !existingIds.has(id),
  )

  if (uniqueIds.length === 0) {
    throw new ChatConversationError(
      "All selected people are already participants",
      "invalid_participants",
    )
  }

  const validRes = await client.query(
    `SELECT
       ci.id,
       COALESCE(u.full_name, m.full_name, 'Participant') AS display_name
     FROM chat_identities ci
     LEFT JOIN users u ON u.id = ci.user_id
     LEFT JOIN members m ON m.id = ci.member_id
    WHERE ci.id = ANY($1::uuid[])
      AND ci.institution_id = $2
      AND ci.is_active = TRUE
      AND ci.is_system = FALSE`,
    [uniqueIds, access.institutionId],
  )

  if ((validRes.rowCount ?? 0) !== uniqueIds.length) {
    throw new ChatConversationError("One or more participants are invalid", "invalid_participants")
  }

  const addedNames = validRes.rows.map((row) => row.display_name as string)
  const systemBody = formatParticipantsAddedBody(addedNames, resolvedActorName)

  await client.query("BEGIN")

  try {
    for (const participantId of uniqueIds) {
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
         VALUES ($1, $2, 'MEMBER')
         ON CONFLICT (conversation_id, chat_identity_id) DO UPDATE
           SET left_at = NULL,
               joined_at = NOW()`,
        [conversationId, participantId],
      )
    }

    const messageRes = await client.query(
      `INSERT INTO messages (
         conversation_id,
         institution_id,
         sender_id,
         message_type,
         body
       )
       VALUES ($1, $2, $3, 'SYSTEM', $4)
       RETURNING id, created_at`,
      [conversationId, access.institutionId, systemIdentityId, systemBody],
    )

    const messageId = messageRes.rows[0].id as string
    const messageCreatedAt = messageRes.rows[0].created_at as string

    await client.query(
      `UPDATE conversations
          SET last_message_id = $2,
              last_message_at = $3,
              last_message_preview = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [conversationId, messageId, messageCreatedAt, systemBody],
    )

    await client.query("COMMIT")

    const conversation = await fetchConversationById(
      client,
      conversationId,
      actorChatIdentityId,
      access.institutionId,
    )
    if (!conversation) {
      throw new Error("add_participants_failed")
    }

    const systemMessage = await loadMessageById(client, messageId)
    const participantIds = await getConversationParticipantIdentityIds(client, conversationId)

    await notifyConversationParticipants(participantIds, {
      type: "participants:added",
      conversationId,
      systemMessage: systemMessage ?? undefined,
      participantIds: uniqueIds,
    })

    return {
      ok: true,
      conversation,
      systemMessageId: messageId,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
