import type { PoolClient } from "@/lib/db"
import type { ChatConversation, ChatParticipant } from "@/lib/chats/types"
import { CHAT_PERMISSIONS } from "@/lib/chats/permissions"

export const SUPPORT_DESK_PARTICIPANT_ID = "support-desk"

export const SUPPORT_DESK_PARTICIPANT: ChatParticipant = {
  id: SUPPORT_DESK_PARTICIPANT_ID,
  name: "Support",
  role: "staff",
  subtitle: "Branch support",
}

export function presentSupportConversationForMember(
  conversation: ChatConversation,
): ChatConversation {
  if (conversation.type !== "SUPPORT") return conversation

  return {
    ...conversation,
    title: "Branch support",
    participants: [SUPPORT_DESK_PARTICIPANT],
  }
}

/** Staff may access a SUPPORT ticket without being a participant if they manage support agents. */
export async function canAccessSupportQueue(
  client: PoolClient,
  options: {
    conversationId: string
    chatIdentityId: string
    hasManageSupportParticipants: boolean
  },
): Promise<{
  allowed: boolean
  institutionId: string
  branchId: string | null
  type: string
  isParticipant: boolean
}> {
  const res = await client.query(
    `
    SELECT
      c.id,
      c.institution_id,
      c.branch_id,
      c.type::text AS type,
      EXISTS (
        SELECT 1
          FROM conversation_participants cp
         WHERE cp.conversation_id = c.id
           AND cp.chat_identity_id = $2
           AND cp.left_at IS NULL
      ) AS is_participant
    FROM conversations c
    WHERE c.id = $1
    LIMIT 1
    `,
    [options.conversationId, options.chatIdentityId],
  )

  if ((res.rowCount ?? 0) === 0) {
    return {
      allowed: false,
      institutionId: "",
      branchId: null,
      type: "",
      isParticipant: false,
    }
  }

  const row = res.rows[0]
  const type = row.type as string
  const isParticipant = Boolean(row.is_participant)
  const institutionId = row.institution_id as string
  const branchId = (row.branch_id as string | null) ?? null

  if (isParticipant) {
    return { allowed: true, institutionId, branchId, type, isParticipant }
  }

  if (type === "SUPPORT" && options.hasManageSupportParticipants) {
    const identityRes = await client.query(
      `SELECT institution_id, branch_id
         FROM chat_identities
        WHERE id = $1
        LIMIT 1`,
      [options.chatIdentityId],
    )
    const identity = identityRes.rows[0]
    if (!identity) {
      return { allowed: false, institutionId, branchId, type, isParticipant }
    }

    const sameInstitution = identity.institution_id === institutionId
    const identityBranch = (identity.branch_id as string | null) ?? null
    const branchOk =
      !branchId || !identityBranch || branchId === identityBranch

    if (sameInstitution && branchOk) {
      return { allowed: true, institutionId, branchId, type, isParticipant }
    }
  }

  return { allowed: false, institutionId, branchId, type, isParticipant }
}

export async function ensureStaffJoinedSupportConversation(
  client: PoolClient,
  conversationId: string,
  chatIdentityId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
     VALUES ($1, $2, 'MEMBER')
     ON CONFLICT (conversation_id, chat_identity_id) DO UPDATE
       SET left_at = NULL`,
    [conversationId, chatIdentityId],
  )
}

/** Staff chat identities with manage_support_chat_participants in the institution/branch. */
export async function listSupportQueueManagerIdentityIds(
  client: PoolClient,
  institutionId: string,
  branchId: string | null,
): Promise<string[]> {
  const res = await client.query(
    `
    SELECT DISTINCT ci.id
      FROM chat_identities ci
      INNER JOIN users u ON u.id = ci.user_id AND u.status = 'Active'
      INNER JOIN role_permissions rp
        ON rp.role_id = u.role_id
       AND rp.branch_id = COALESCE(u.branch_id, ci.branch_id)
      INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE ci.institution_id = $1
       AND ci.is_active = TRUE
       AND ci.is_system = FALSE
       AND p.name = $2
       AND ($3::uuid IS NULL OR ci.branch_id IS NULL OR ci.branch_id = $3)
    `,
    [institutionId, CHAT_PERMISSIONS.manageSupportChatParticipants, branchId],
  )

  return res.rows.map((row) => row.id as string)
}

export async function getConversationStaffParticipantIdentityIds(
  client: PoolClient,
  conversationId: string,
): Promise<string[]> {
  const res = await client.query(
    `
    SELECT cp.chat_identity_id
      FROM conversation_participants cp
      INNER JOIN chat_identities ci ON ci.id = cp.chat_identity_id
     WHERE cp.conversation_id = $1
       AND cp.left_at IS NULL
       AND ci.user_id IS NOT NULL
       AND ci.is_system = FALSE
    `,
    [conversationId],
  )

  return res.rows.map((row) => row.chat_identity_id as string)
}
