import type { PoolClient } from "pg"

/** Resolve branch for invoice writes when the actor has no branch (e.g. super admin). */
export async function resolveInvoiceBranchId(
  client: PoolClient,
  institutionId: string,
  actorBranchId: string | null,
  memberId?: string,
  thirdPartyAgentId?: string,
): Promise<string | null> {
  if (actorBranchId) return actorBranchId

  if (memberId) {
    const res = await client.query<{ branch_id: string }>(
      `SELECT branch_id FROM members WHERE id = $1 AND institution_id = $2 LIMIT 1`,
      [memberId, institutionId],
    )
    return res.rows[0]?.branch_id ?? null
  }

  if (thirdPartyAgentId) {
    const res = await client.query<{ branch_id: string }>(
      `SELECT branch_id FROM third_party_agents WHERE id = $1 AND institution_id = $2 LIMIT 1`,
      [thirdPartyAgentId, institutionId],
    )
    return res.rows[0]?.branch_id ?? null
  }

  return null
}
