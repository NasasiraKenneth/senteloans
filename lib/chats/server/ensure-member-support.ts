import type { PoolClient } from "@/lib/db"
import type { ChatConversation } from "@/lib/chats/types"
import { fetchConversationById } from "./fetch-conversation"
import { presentSupportConversationForMember } from "./support-access"
import {
  getConversationParticipantIdentityIds,
  notifyInboxParticipants,
} from "./notify-inbox"

export type EnsureMemberSupportResult = {
  conversation: ChatConversation
  created: boolean
}

/**
 * Ensures the member has a branch SUPPORT ticket with only the member as participant.
 * Staff are never auto-added — agents join via manage_support_chat_participants.
 */
export async function ensureMemberSupportConversation(
  client: PoolClient,
  options: {
    memberChatIdentityId: string
    memberId: string
    institutionId: string
    branchId: string | null
    systemIdentityId: string
    memberDisplayName?: string
  },
): Promise<EnsureMemberSupportResult> {
  const {
    memberChatIdentityId,
    memberId,
    institutionId,
    branchId,
    systemIdentityId,
  } = options

  const existingRes = await client.query(
    `SELECT conversation_id
       FROM conversation_references
      WHERE institution_id = $1
        AND reference_type = 'MEMBER'
        AND reference_id = $2
      LIMIT 1`,
    [institutionId, memberId],
  )

  const existingId = existingRes.rows[0]?.conversation_id as string | undefined
  if (existingId) {
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
       VALUES ($1, $2, 'OWNER')
       ON CONFLICT (conversation_id, chat_identity_id) DO UPDATE
         SET left_at = NULL`,
      [existingId, memberChatIdentityId],
    )

    const conversation = await fetchConversationById(
      client,
      existingId,
      memberChatIdentityId,
      institutionId,
      { viewerRole: "member" },
    )
    if (!conversation) throw new Error("support_thread_open_failed")

    return {
      conversation: presentSupportConversationForMember(conversation),
      created: false,
    }
  }

  const memberName =
    options.memberDisplayName?.trim() ||
    (
      await client.query(
        `SELECT full_name FROM members WHERE id = $1 LIMIT 1`,
        [memberId],
      )
    ).rows[0]?.full_name ||
    "Member"

  const title = `Support — ${memberName}`
  const systemBody = `Support thread opened for ${memberName}`

  await client.query("BEGIN")
  try {
    const conversationRes = await client.query(
      `INSERT INTO conversations (
         institution_id,
         branch_id,
         type,
         title,
         created_by,
         support_status
       )
       VALUES ($1, $2, 'SUPPORT', $3, $4, 'OPEN')
       RETURNING id`,
      [institutionId, branchId, title, memberChatIdentityId],
    )
    const conversationId = conversationRes.rows[0].id as string

    await client.query(
      `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [conversationId, memberChatIdentityId],
    )

    await client.query(
      `INSERT INTO conversation_references (
         conversation_id,
         institution_id,
         reference_type,
         reference_id
       )
       VALUES ($1, $2, 'MEMBER', $3)`,
      [conversationId, institutionId, memberId],
    )

    const messageRes = await client.query(
      `INSERT INTO messages (
         conversation_id,
         institution_id,
         sender_id,
         message_type,
         visibility,
         body
       )
       VALUES ($1, $2, $3, 'SYSTEM', 'INTERNAL', $4)
       RETURNING id, created_at`,
      [conversationId, institutionId, systemIdentityId, systemBody],
    )

    // Do not set last_message_* from INTERNAL open event — keep member inbox clean.
    await client.query(
      `UPDATE conversations
          SET updated_at = NOW()
        WHERE id = $1`,
      [conversationId],
    )

    void messageRes

    await client.query("COMMIT")

    const conversation = await fetchConversationById(
      client,
      conversationId,
      memberChatIdentityId,
      institutionId,
      { viewerRole: "member" },
    )
    if (!conversation) throw new Error("support_thread_create_failed")

    const ids = await getConversationParticipantIdentityIds(client, conversationId)
    await notifyInboxParticipants(ids)

    return {
      conversation: presentSupportConversationForMember(conversation),
      created: true,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
