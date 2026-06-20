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

export type MemberWriteGateRouteError = {
  error: MemberWriteGateError
  memberStatus?: MemberStatus
  branchStatus?: BranchStatus
}

/** Convert a failed write gate into the route-handler error shape used across member APIs. */
export function memberWriteGateRouteError(
  gate: MemberWriteGateResult,
): MemberWriteGateRouteError | null {
  if (gate.ok) return null
  return {
    error: gate.error,
    memberStatus: gate.memberStatus,
    branchStatus: gate.branchStatus,
  }
}

/** HTTP status for member/branch write-gate failures. */
export function memberWriteGateHttpStatus(error: string): number {
  if (error === "member_not_found") return 404
  if (
    error === "member_inactive" ||
    error === "branch_inactive" ||
    error === "branch_not_found"
  ) {
    return 403
  }
  return 403
}

/** JSON body for member route denial responses (write gate, permissions, etc.). */
export function memberRouteDenialBody(result: {
  error: string
  memberStatus?: MemberStatus
  branchStatus?: BranchStatus
  message?: string
  detail?: string
  includeCode?: boolean
}): Record<string, unknown> {
  const payload: Record<string, unknown> = { error: result.error }
  if (result.includeCode !== false) payload.code = result.error
  if (result.memberStatus) payload.member_status = result.memberStatus
  if (result.branchStatus) payload.branch_status = result.branchStatus
  if (result.message) payload.message = result.message
  if (result.detail) payload.detail = result.detail
  return payload
}

export type MemberRouteHttpStatusGroups = {
  forbidden?: readonly string[]
  notFound?: readonly string[]
  badRequest?: readonly string[]
  serverError?: readonly string[]
  defaultStatus?: number
}

/** Classify route error codes to HTTP status, falling back to write-gate rules. */
export function memberRouteHttpStatus(
  error: string,
  groups: MemberRouteHttpStatusGroups = {},
): number {
  if (groups.forbidden?.includes(error)) return 403
  if (groups.notFound?.includes(error)) return 404
  if (groups.badRequest?.includes(error)) return 400
  if (groups.serverError?.includes(error)) return 500
  if (error.startsWith("minimum_shares_") || error.startsWith("maximum_shares_")) return 400
  return groups.defaultStatus ?? memberWriteGateHttpStatus(error)
}

export const MEMBER_WRITE_GATE_CLIENT_ERRORS = [
  "member_inactive",
  "branch_inactive",
  "branch_not_found",
  "member_not_found",
] as const

export function isMemberWriteGateClientError(code: string): boolean {
  return (MEMBER_WRITE_GATE_CLIENT_ERRORS as readonly string[]).includes(code)
}

export type MemberRouteDenial = {
  error: string
  memberStatus?: MemberStatus
  branchStatus?: BranchStatus
  message?: string
  detail?: string
}

export function isMemberRouteDenial(result: unknown): result is MemberRouteDenial {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as { error?: unknown }).error === "string"
  )
}

/** Client-facing message for member/branch write-gate failures. */
export function mapMemberWriteGateClientMessage(code: unknown, action = "complete this action"): string {
  switch (String(code || "")) {
    case "member_inactive":
      return `This member is not active. Reactivate the member before ${action}.`
    case "branch_inactive":
      return `This member's branch is not active. Reactivate the branch before ${action}.`
    case "branch_not_found":
      return `This member's branch could not be found. Assign an active branch before ${action}.`
    case "member_not_found":
      return "Member not found."
    default:
      return String(code || "Unexpected error")
  }
}
