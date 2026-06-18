import type { PoolClient } from "pg"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"

export type MemberStatus = "Active" | "Inactive" | "Suspended" | "Closed"

export interface MemberRow {
  id: string
  institution_id: string
  branch_id: string
  full_name: string
  member_number: string
  email: string | null
  status: MemberStatus
}

export type MemberStatusError = "member_not_found" | "member_inactive"

export type MemberStatusResult =
  | { ok: true; member: MemberRow }
  | { ok: false; error: MemberStatusError; status?: MemberStatus }

export type MemberWriteGateError = MemberStatusError | "branch_not_found" | "branch_inactive"

export type MemberWriteGateResult =
  | { ok: true; member: MemberRow }
  | {
      ok: false
      error: MemberWriteGateError
      memberStatus?: MemberStatus
      branchStatus?: BranchStatus
    }

const MEMBER_LOOKUP_SQL = `SELECT
     id,
     institution_id,
     branch_id,
     full_name,
     member_number,
     email,
     status::text AS status
   FROM members
  WHERE id = $1
  LIMIT 1`

/**
 * Look up a member by id. When `institutionId` is supplied, members outside that
 * tenant are treated as not found.
 */
export async function getMemberById(
  client: PoolClient,
  memberId: string,
  institutionId?: string,
): Promise<MemberStatusResult> {
  const res = await client.query<MemberRow>(MEMBER_LOOKUP_SQL, [memberId])
  const row = res.rows[0]
  if (!row) return { ok: false, error: "member_not_found" }
  if (institutionId && row.institution_id !== institutionId) {
    return { ok: false, error: "member_not_found" }
  }
  return { ok: true, member: row }
}

/**
 * Evaluate an already-loaded member row without hitting the database again.
 */
export function assertMemberActiveRow(
  member: Pick<MemberRow, "status"> & Partial<MemberRow>,
): MemberStatusResult {
  const status = member.status
  if (status !== "Active") {
    return { ok: false, error: "member_inactive", status }
  }
  return { ok: true, member: member as MemberRow }
}

/**
 * Load a member and enforce `Active` status. Use on write paths that should be
 * blocked for suspended, closed, or otherwise inactive members.
 */
export async function assertMemberActive(
  client: PoolClient,
  memberId: string,
  institutionId?: string,
): Promise<MemberStatusResult> {
  const res = await getMemberById(client, memberId, institutionId)
  if (!res.ok) return res
  if (res.member.status !== "Active") {
    return { ok: false, error: "member_inactive", status: res.member.status }
  }
  return res
}

/**
 * Load a member, require `Active` status, and require an active branch.
 * Pass `institutionId` to scope the lookup to one tenant; omit for cross-tenant
 * callers (e.g. system admin).
 */
export async function assertMemberAndBranchActive(
  client: PoolClient,
  memberId: string,
  institutionId?: string,
): Promise<MemberWriteGateResult> {
  let memberCheck: MemberStatusResult
  if (institutionId) {
    memberCheck = await assertMemberActive(client, memberId, institutionId)
  } else {
    const lookup = await getMemberById(client, memberId)
    if (!lookup.ok) return { ok: false, error: lookup.error }
    memberCheck = assertMemberActiveRow(lookup.member)
  }

  if (!memberCheck.ok) {
    return {
      ok: false,
      error: memberCheck.error,
      ...(memberCheck.error === "member_inactive" ? { memberStatus: memberCheck.status } : {}),
    }
  }

  const branchCheck = await assertBranchActive(client, memberCheck.member.branch_id)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error,
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }

  return { ok: true, member: memberCheck.member }
}
