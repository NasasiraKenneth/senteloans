import type { PoolClient } from "@/lib/db"

export type ChatIdentityContext = {
  id: string
  institutionId: string
  branchId: string | null
  isSystem: boolean
}

export async function getChatIdentityByUserId(
  client: PoolClient,
  userId: string,
): Promise<ChatIdentityContext | null> {
  const res = await client.query(
    `SELECT id, institution_id, branch_id, is_system
       FROM chat_identities
      WHERE user_id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [userId],
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    id: row.id,
    institutionId: row.institution_id,
    branchId: row.branch_id ?? null,
    isSystem: Boolean(row.is_system),
  }
}

export async function getChatIdentityByMemberId(
  client: PoolClient,
  memberId: string,
): Promise<ChatIdentityContext | null> {
  const res = await client.query(
    `SELECT id, institution_id, branch_id, is_system
       FROM chat_identities
      WHERE member_id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [memberId],
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    id: row.id,
    institutionId: row.institution_id,
    branchId: row.branch_id ?? null,
    isSystem: Boolean(row.is_system),
  }
}

export async function ensureStaffChatIdentity(
  client: PoolClient,
  userId: string,
): Promise<ChatIdentityContext> {
  const existing = await getChatIdentityByUserId(client, userId)
  if (existing) return existing

  const userRes = await client.query(
    `SELECT id, institution_id, branch_id
       FROM users
      WHERE id = $1
        AND status = 'Active'
      LIMIT 1`,
    [userId],
  )
  const user = userRes.rows[0]
  if (!user) throw new Error("staff_user_not_found")

  const ins = await client.query(
    `INSERT INTO chat_identities (institution_id, branch_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET updated_at = NOW(),
           is_active = TRUE
     RETURNING id, institution_id, branch_id, is_system`,
    [user.institution_id, user.branch_id, userId],
  )
  const row = ins.rows[0]
  return {
    id: row.id,
    institutionId: row.institution_id,
    branchId: row.branch_id ?? null,
    isSystem: Boolean(row.is_system),
  }
}

export async function ensureMemberChatIdentity(
  client: PoolClient,
  memberId: string,
): Promise<ChatIdentityContext> {
  const existing = await getChatIdentityByMemberId(client, memberId)
  if (existing) return existing

  const memberRes = await client.query(
    `SELECT id, institution_id, branch_id
       FROM members
      WHERE id = $1
      LIMIT 1`,
    [memberId],
  )
  const member = memberRes.rows[0]
  if (!member) throw new Error("member_not_found")

  const ins = await client.query(
    `INSERT INTO chat_identities (institution_id, branch_id, member_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_id) DO UPDATE
       SET updated_at = NOW(),
           is_active = TRUE
     RETURNING id, institution_id, branch_id, is_system`,
    [member.institution_id, member.branch_id, memberId],
  )
  const row = ins.rows[0]
  return {
    id: row.id,
    institutionId: row.institution_id,
    branchId: row.branch_id ?? null,
    isSystem: Boolean(row.is_system),
  }
}

export async function ensureSystemChatIdentity(
  client: PoolClient,
  institutionId: string,
): Promise<string> {
  const existing = await client.query(
    `SELECT id
       FROM chat_identities
      WHERE institution_id = $1
        AND is_system = TRUE
      LIMIT 1`,
    [institutionId],
  )
  if (existing.rows[0]?.id) return existing.rows[0].id

  const ins = await client.query(
    `INSERT INTO chat_identities (institution_id, is_system)
     SELECT $1, TRUE
     WHERE NOT EXISTS (
       SELECT 1
         FROM chat_identities
        WHERE institution_id = $1
          AND is_system = TRUE
     )
     RETURNING id`,
    [institutionId],
  )
  if (ins.rows[0]?.id) return ins.rows[0].id

  const retry = await client.query(
    `SELECT id
       FROM chat_identities
      WHERE institution_id = $1
        AND is_system = TRUE
      LIMIT 1`,
    [institutionId],
  )
  if (!retry.rows[0]?.id) throw new Error("system_identity_bootstrap_failed")
  return retry.rows[0].id
}
