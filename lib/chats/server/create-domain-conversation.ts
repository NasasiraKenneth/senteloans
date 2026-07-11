import type { PoolClient } from "@/lib/db"
import type { ChatConversation, ConversationType } from "@/lib/chats/types"
import { ChatConversationError } from "./create-conversation"
import { fetchConversationById } from "./fetch-conversation"
import {
  getConversationParticipantIdentityIds,
  notifyInboxParticipants,
} from "./notify-inbox"
import { ensureSupportManagerParticipants } from "./support-access"

export type DomainConversationKind = "loan" | "branch" | "support" | "committee"

type BaseParams = {
  creatorChatIdentityId: string
  institutionId: string
  branchId: string | null
  systemIdentityId: string
  participantChatIdentityIds?: string[]
}

export type CreateLoanThreadParams = BaseParams & {
  kind: "loan"
  loanId: string
  title?: string
}

export type CreateBranchThreadParams = BaseParams & {
  kind: "branch"
  branchReferenceId: string
  title?: string
}

export type CreateSupportThreadParams = BaseParams & {
  kind: "support"
  memberChatIdentityId: string
  title?: string
}

export type CreateCommitteeThreadParams = BaseParams & {
  kind: "committee"
  name: string
  description?: string
}

export type CreateDomainConversationParams =
  | CreateLoanThreadParams
  | CreateBranchThreadParams
  | CreateSupportThreadParams
  | CreateCommitteeThreadParams

export type CreateDomainConversationResult = {
  conversation: ChatConversation
  created: boolean
}

function conversationTypeForKind(kind: DomainConversationKind): ConversationType {
  switch (kind) {
    case "loan":
      return "LOAN"
    case "branch":
      return "BRANCH"
    case "support":
      return "SUPPORT"
    case "committee":
      return "COMMITTEE"
  }
}

async function validateParticipantIds(
  client: PoolClient,
  institutionId: string,
  participantIds: string[],
): Promise<void> {
  if (participantIds.length === 0) return

  const res = await client.query(
    `SELECT id
       FROM chat_identities
      WHERE id = ANY($1::uuid[])
        AND institution_id = $2
        AND is_active = TRUE
        AND is_system = FALSE`,
    [participantIds, institutionId],
  )

  if ((res.rowCount ?? 0) !== participantIds.length) {
    throw new ChatConversationError("One or more participants are invalid", "invalid_participants")
  }
}

async function findByReference(
  client: PoolClient,
  institutionId: string,
  referenceType: "LOAN" | "BRANCH" | "MEMBER",
  referenceId: string,
): Promise<string | null> {
  const res = await client.query(
    `SELECT conversation_id
       FROM conversation_references
      WHERE institution_id = $1
        AND reference_type = $2
        AND reference_id = $3
      LIMIT 1`,
    [institutionId, referenceType, referenceId],
  )
  return (res.rows[0]?.conversation_id as string | undefined) ?? null
}

async function insertParticipants(
  client: PoolClient,
  conversationId: string,
  creatorChatIdentityId: string,
  participantIds: string[],
): Promise<void> {
  await client.query(
    `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
     VALUES ($1, $2, 'OWNER')
     ON CONFLICT (conversation_id, chat_identity_id) DO UPDATE
       SET left_at = NULL`,
    [conversationId, creatorChatIdentityId],
  )

  for (const participantId of participantIds) {
    if (participantId === creatorChatIdentityId) continue
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
       VALUES ($1, $2, 'MEMBER')
       ON CONFLICT (conversation_id, chat_identity_id) DO UPDATE
         SET left_at = NULL`,
      [conversationId, participantId],
    )
  }
}

async function insertSystemMessage(
  client: PoolClient,
  conversationId: string,
  institutionId: string,
  systemIdentityId: string,
  body: string,
  visibility: "PUBLIC" | "INTERNAL" = "PUBLIC",
): Promise<{ messageId: string; createdAt: string }> {
  const messageRes = await client.query(
    `INSERT INTO messages (
       conversation_id,
       institution_id,
       sender_id,
       message_type,
       visibility,
       body
     )
     VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
     RETURNING id, created_at`,
    [conversationId, institutionId, systemIdentityId, visibility, body],
  )

  return {
    messageId: messageRes.rows[0].id as string,
    createdAt: messageRes.rows[0].created_at as string,
  }
}

export async function createOrOpenDomainConversation(
  client: PoolClient,
  params: CreateDomainConversationParams,
): Promise<CreateDomainConversationResult> {
  const {
    creatorChatIdentityId,
    institutionId,
    branchId,
    systemIdentityId,
  } = params

  const participantIds = [
    ...new Set((params.participantChatIdentityIds ?? []).filter(Boolean)),
  ]

  if (params.kind === "committee") {
    const trimmedName = params.name.trim()
    if (!trimmedName) {
      throw new ChatConversationError("Committee name is required", "invalid_participants")
    }
    await validateParticipantIds(client, institutionId, participantIds)

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
         VALUES ($1, $2, 'COMMITTEE', $3, $4, $5)
         RETURNING id`,
        [
          institutionId,
          branchId,
          trimmedName,
          params.description?.trim() || null,
          creatorChatIdentityId,
        ],
      )
      const conversationId = conversationRes.rows[0].id as string
      await insertParticipants(client, conversationId, creatorChatIdentityId, participantIds)

      const systemBody = params.description?.trim()
        ? `Committee "${trimmedName}" created — ${params.description.trim()}`
        : `Committee "${trimmedName}" created`
      const { messageId, createdAt } = await insertSystemMessage(
        client,
        conversationId,
        institutionId,
        systemIdentityId,
        systemBody,
      )

      await client.query(
        `UPDATE conversations
            SET last_message_id = $2,
                last_message_at = $3,
                last_message_preview = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [conversationId, messageId, createdAt, systemBody],
      )

      await client.query("COMMIT")

      const conversation = await fetchConversationById(
        client,
        conversationId,
        creatorChatIdentityId,
        institutionId,
      )
      if (!conversation) throw new Error("committee_create_failed")

      const ids = await getConversationParticipantIdentityIds(client, conversationId)
      await notifyInboxParticipants(ids)

      return { conversation, created: true }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  }

  let referenceType: "LOAN" | "BRANCH" | "MEMBER"
  let referenceId: string
  let title: string
  let systemBody: string
  let extraParticipants = [...participantIds]

  if (params.kind === "loan") {
    const loanRes = await client.query(
      `SELECT id, application_id, member_id, branch_id
         FROM loans
        WHERE id = $1
          AND institution_id = $2
        LIMIT 1`,
      [params.loanId, institutionId],
    )
    if ((loanRes.rowCount ?? 0) === 0) {
      throw new ChatConversationError("Loan not found", "target_not_found")
    }

    const loan = loanRes.rows[0]
    referenceType = "LOAN"
    referenceId = loan.id as string
    title = params.title?.trim() || `Loan ${loan.application_id || loan.id}`
    systemBody = `Loan thread opened for ${loan.application_id || "loan"}`

    if (loan.member_id) {
      const memberIdentity = await client.query(
        `SELECT id FROM chat_identities
          WHERE member_id = $1 AND institution_id = $2 AND is_active = TRUE
          LIMIT 1`,
        [loan.member_id, institutionId],
      )
      if (memberIdentity.rows[0]?.id) {
        extraParticipants.push(memberIdentity.rows[0].id as string)
      }
    }
  } else if (params.kind === "branch") {
    const branchRes = await client.query(
      `SELECT id, name FROM branches
        WHERE id = $1 AND institution_id = $2
        LIMIT 1`,
      [params.branchReferenceId, institutionId],
    )
    if ((branchRes.rowCount ?? 0) === 0) {
      throw new ChatConversationError("Branch not found", "target_not_found")
    }

    referenceType = "BRANCH"
    referenceId = branchRes.rows[0].id as string
    title = params.title?.trim() || `${branchRes.rows[0].name} channel`
    systemBody = `Branch channel opened for ${branchRes.rows[0].name}`
  } else {
    // support
    const memberIdentityRes = await client.query(
      `SELECT ci.id, m.full_name
         FROM chat_identities ci
         INNER JOIN members m ON m.id = ci.member_id
        WHERE ci.id = $1
          AND ci.institution_id = $2
          AND ci.is_active = TRUE
        LIMIT 1`,
      [params.memberChatIdentityId, institutionId],
    )
    if ((memberIdentityRes.rowCount ?? 0) === 0) {
      throw new ChatConversationError("Member not found", "target_not_found")
    }

    const memberIdentityId = memberIdentityRes.rows[0].id as string
    const memberName = memberIdentityRes.rows[0].full_name as string
    const memberIdRes = await client.query(
      `SELECT member_id FROM chat_identities WHERE id = $1 LIMIT 1`,
      [memberIdentityId],
    )
    referenceType = "MEMBER"
    referenceId = memberIdRes.rows[0].member_id as string
    title = params.title?.trim() || `Support — ${memberName}`
    systemBody = `Support thread opened for ${memberName}`
    extraParticipants.push(memberIdentityId)
  }

  extraParticipants = [...new Set(extraParticipants.filter(Boolean))]
  await validateParticipantIds(client, institutionId, extraParticipants)

  const existingId = await findByReference(client, institutionId, referenceType, referenceId)
  if (existingId) {
    // Ensure creator is a participant when reopening
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
       VALUES ($1, $2, 'MEMBER')
       ON CONFLICT (conversation_id, chat_identity_id) DO UPDATE
         SET left_at = NULL`,
      [existingId, creatorChatIdentityId],
    )

    if (params.kind === "support") {
      await ensureSupportManagerParticipants(client, existingId, institutionId, branchId)
    }

    const conversation = await fetchConversationById(
      client,
      existingId,
      creatorChatIdentityId,
      institutionId,
    )
    if (!conversation) {
      throw new ChatConversationError("Conversation not found", "target_not_found")
    }

    return { conversation, created: false }
  }

  const type = conversationTypeForKind(params.kind)
  const systemVisibility = params.kind === "support" ? "INTERNAL" : "PUBLIC"

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
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        institutionId,
        branchId,
        type,
        title,
        creatorChatIdentityId,
        params.kind === "support" ? "OPEN" : null,
      ],
    )
    const conversationId = conversationRes.rows[0].id as string

    await insertParticipants(client, conversationId, creatorChatIdentityId, extraParticipants)

    await client.query(
      `INSERT INTO conversation_references (
         conversation_id,
         institution_id,
         reference_type,
         reference_id
       )
       VALUES ($1, $2, $3, $4)`,
      [conversationId, institutionId, referenceType, referenceId],
    )

    const { messageId, createdAt } = await insertSystemMessage(
      client,
      conversationId,
      institutionId,
      systemIdentityId,
      systemBody,
      systemVisibility,
    )

    if (systemVisibility === "PUBLIC") {
      await client.query(
        `UPDATE conversations
            SET last_message_id = $2,
                last_message_at = $3,
                last_message_preview = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [conversationId, messageId, createdAt, systemBody],
      )
    } else {
      await client.query(
        `UPDATE conversations
            SET updated_at = NOW()
          WHERE id = $1`,
        [conversationId],
      )
    }

    if (params.kind === "support") {
      await ensureSupportManagerParticipants(client, conversationId, institutionId, branchId)
    }

    await client.query("COMMIT")

    const conversation = await fetchConversationById(
      client,
      conversationId,
      creatorChatIdentityId,
      institutionId,
    )
    if (!conversation) throw new Error("domain_thread_create_failed")

    const ids = await getConversationParticipantIdentityIds(client, conversationId)
    await notifyInboxParticipants(ids)

    return { conversation, created: true }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
