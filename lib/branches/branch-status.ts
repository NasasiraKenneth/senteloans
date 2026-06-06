import type { PoolClient } from "pg"

export type BranchStatus = "Active" | "Inactive" | "Suspended" | "Closed"

export interface BranchRow {
  id: string
  institution_id: string
  name: string
  status: BranchStatus
}

export type BranchStatusError = "branch_not_found" | "branch_inactive"

export type BranchStatusResult =
  | { ok: true; branch: BranchRow }
  | { ok: false; error: BranchStatusError; status?: BranchStatus }

/**
 * Look up a branch by id and return its row + active status flag.
 * Centralised so every write endpoint can fail fast on inactive branches
 * (instead of each route re-implementing the same query).
 */
export async function getBranchById(
  client: PoolClient,
  branchId: string,
): Promise<BranchStatusResult> {
  const res = await client.query<BranchRow>(
    `SELECT id, institution_id, name, status::text AS status
       FROM branches
      WHERE id = $1
      LIMIT 1`,
    [branchId],
  )
  const row = res.rows[0]
  if (!row) return { ok: false, error: "branch_not_found" }
  return { ok: true, branch: row }
}

/**
 * Convenience wrapper around `getBranchById` that also enforces the branch
 * being `Active`. Use this in any write path that should be blocked when a
 * branch is suspended, closed, or otherwise inactive.
 */
export async function assertBranchActive(
  client: PoolClient,
  branchId: string,
): Promise<BranchStatusResult> {
  const res = await getBranchById(client, branchId)
  if (!res.ok) return res
  if (res.branch.status !== "Active") {
    return { ok: false, error: "branch_inactive", status: res.branch.status }
  }
  return res
}
