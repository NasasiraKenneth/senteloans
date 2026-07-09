import type { PoolClient } from "@/lib/db"
import type { ChatConversation } from "@/lib/chats/types"
import { fetchConversationById } from "./fetch-conversation"
import {
  getConversationParticipantIdentityIds,
  notifyInboxParticipants,
} from "./notify-inbox"

export class ChatConversationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_target"
      | "target_not_found"
      | "same_participant"
      | "forbidden"
      | "invalid_participants",
  ) {
    super(message)
    this.name = "ChatConversationError"
  }
}

function orderIdentityPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

async function validateTargetIdentity(
  client: PoolClient,
  targetChatIdentityId: string,
  institutionId: string,
  creatorChatIdentityId: string,
): Promise<void> {
  if (targetChatIdentityId === creatorChatIdentityId) {
    throw new ChatConversationError("Cannot start a conversation with yourself", "same_participant")
  }

  const res = await client.query(
    `SELECT id
       FROM chat_identities
      WHERE id = $1
        AND institution_id = $2
        AND is_active = TRUE
        AND is_system = FALSE
      LIMIT 1`,
    [targetChatIdentityId, institutionId],
  )

  if ((res.rowCount ?? 0) === 0) {
    throw new ChatConversationError("Contact not found", "target_not_found")
  }
}

export type CreateDirectConversationResult = {
  conversation: ChatConversation
  created: boolean
}

export async function createOrOpenDirectConversation(
  client: PoolClient,
  params: {
    creatorChatIdentityId: string
    targetChatIdentityId: string
    institutionId: string
    branchId: string | null
  },
): Promise<CreateDirectConversationResult> {
  const { creatorChatIdentityId, targetChatIdentityId, institutionId, branchId } = params

  await validateTargetIdentity(
    client,
    targetChatIdentityId,
    institutionId,
    creatorChatIdentityId,
  )

  const [identityA, identityB] = orderIdentityPair(creatorChatIdentityId, targetChatIdentityId)

  const existingRes = await client.query(
    `SELECT conversation_id
       FROM conversation_direct_keys
      WHERE institution_id = $1
        AND identity_a = $2
        AND identity_b = $3
      LIMIT 1`,
    [institutionId, identityA, identityB],
  )

  if (existingRes.rows[0]?.conversation_id) {
    const conversationId = existingRes.rows[0].conversation_id as string
    const conversation = await fetchConversationById(
      client,
      conversationId,
      creatorChatIdentityId,
      institutionId,
    )
    if (!conversation) {
      throw new ChatConversationError("Conversation not found", "target_not_found")
    }

    return { conversation, created: false }
  }

  await client.query("BEGIN")

  try {
    const conversationRes = await client.query(
      `INSERT INTO conversations (
         institution_id,
         branch_id,
         type,
         created_by
       )
       VALUES ($1, $2, 'DIRECT', $3)
       RETURNING id`,
      [institutionId, branchId, creatorChatIdentityId],
    )
    const conversationId = conversationRes.rows[0].id as string

    await client.query(
      `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
       VALUES
         ($1, $2, 'MEMBER'),
         ($1, $3, 'MEMBER')`,
      [conversationId, creatorChatIdentityId, targetChatIdentityId],
    )

    await client.query(
      `INSERT INTO conversation_direct_keys (
         institution_id,
         identity_a,
         identity_b,
         conversation_id
       )
       VALUES ($1, $2, $3, $4)`,
      [institutionId, identityA, identityB, conversationId],
    )

    await client.query("COMMIT")

    const conversation = await fetchConversationById(
      client,
      conversationId,
      creatorChatIdentityId,
      institutionId,
    )
    if (!conversation) {
      throw new Error("conversation_create_failed")
    }

    await notifyInboxParticipants([creatorChatIdentityId, targetChatIdentityId])

    return { conversation, created: true }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

export async function createGroupConversation(
  client: PoolClient,
  params: {
    creatorChatIdentityId: string
    institutionId: string
    branchId: string | null
    name: string
    description?: string
    participantChatIdentityIds: string[]
    systemIdentityId: string
  },
): Promise<ChatConversation> {
  const {
    creatorChatIdentityId,
    institutionId,
    branchId,
    name,
    description = "",
    participantChatIdentityIds,
    systemIdentityId,
  } = params

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new ChatConversationError("Group name is required", "invalid_participants")
  }

  const uniqueParticipantIds = [
    ...new Set(
      participantChatIdentityIds.filter((id) => id && id !== creatorChatIdentityId),
    ),
  ]

  if (uniqueParticipantIds.length === 0) {
    throw new ChatConversationError("Select at least one participant", "invalid_participants")
  }

  const validRes = await client.query(
    `SELECT id
       FROM chat_identities
      WHERE id = ANY($1::uuid[])
        AND institution_id = $2
        AND is_active = TRUE
        AND is_system = FALSE`,
    [uniqueParticipantIds, institutionId],
  )

  if ((validRes.rowCount ?? 0) !== uniqueParticipantIds.length) {
    throw new ChatConversationError("One or more participants are invalid", "invalid_participants")
  }

  const systemBody = description.trim()
    ? `Group "${trimmedName}" created — ${description.trim()}`
    : `Group "${trimmedName}" created`

  await client.query("BEGIN")

  try {
    const conversationRes = await client.query(
      `INSERT INTO conversations (
         institution_id,
         branch_id,
         type,
         title,
         description,
         created_by
       )
       VALUES ($1, $2, 'GROUP', $3, $4, $5)
       RETURNING id`,
      [institutionId, branchId, trimmedName, description.trim() || null, creatorChatIdentityId],
    )
    const conversationId = conversationRes.rows[0].id as string

    await client.query(
      `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [conversationId, creatorChatIdentityId],
    )

    for (const participantId of uniqueParticipantIds) {
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
         VALUES ($1, $2, 'MEMBER')`,
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
      [conversationId, institutionId, systemIdentityId, systemBody],
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
      creatorChatIdentityId,
      institutionId,
    )
    if (!conversation) {
      throw new Error("group_create_failed")
    }

    const participantIds = await getConversationParticipantIdentityIds(client, conversationId)
    await notifyInboxParticipants(participantIds)

    return conversation
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
