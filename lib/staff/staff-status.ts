import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"

export type StaffStatus = "Active" | "Inactive" | "Suspended" | "Closed"

export interface StaffRow {
  id: string
  institution_id: string
  branch_id: string
  full_name: string
  email: string
  status: StaffStatus
}

export type StaffStatusError = "staff_not_found" | "staff_inactive"

export type StaffStatusResult =
  | { ok: true; staff: StaffRow }
  | { ok: false; error: StaffStatusError; status?: StaffStatus }

export type StaffWriteGateError = StaffStatusError | "branch_not_found" | "branch_inactive"

export type StaffWriteGateResult =
  | { ok: true; staff: StaffRow }
  | {
      ok: false
      error: StaffWriteGateError
      staffStatus?: StaffStatus
      branchStatus?: BranchStatus
    }

const STAFF_LOOKUP_SQL = `SELECT
     id,
     institution_id,
     branch_id,
     full_name,
     email,
     status::text AS status
   FROM users
  WHERE id = $1
  LIMIT 1`

/**
 * Look up a staff user by id. When `institutionId` is supplied, users outside
 * that tenant are treated as not found.
 */
export async function getStaffById(
  client: PoolClient,
  staffId: string,
  institutionId?: string,
): Promise<StaffStatusResult> {
  const res = await client.query<StaffRow>(STAFF_LOOKUP_SQL, [staffId])
  const row = res.rows[0]
  if (!row) return { ok: false, error: "staff_not_found" }
  if (institutionId && row.institution_id !== institutionId) {
    return { ok: false, error: "staff_not_found" }
  }
  return { ok: true, staff: row }
}

/**
 * Evaluate an already-loaded staff row without hitting the database again.
 * Works with `ActorContext` when `resolveActorContext` included `status`.
 */
export function assertStaffActiveRow(
  staff: Pick<StaffRow, "status"> & Partial<StaffRow>,
): StaffStatusResult {
  if (staff.status !== "Active") {
    return { ok: false, error: "staff_inactive", status: staff.status }
  }
  return { ok: true, staff: staff as StaffRow }
}

/**
 * Load a staff user and enforce `Active` status. Use on write paths that should
 * be blocked when the actor has been suspended or deactivated.
 */
export async function assertStaffActive(
  client: PoolClient,
  staffId: string,
  institutionId?: string,
): Promise<StaffStatusResult> {
  const res = await getStaffById(client, staffId, institutionId)
  if (!res.ok) return res
  return assertStaffActiveRow(res.staff)
}

/**
 * Assert the current actor (logged-in staff) is active. Re-queries when
 * `status` is not already present on the actor context.
 */
export async function assertActorActive(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id"> & Partial<Pick<ActorContext, "status">>,
): Promise<StaffStatusResult> {
  if (actor.status) {
    return assertStaffActiveRow({
      id: actor.id,
      institution_id: actor.institution_id,
      status: actor.status,
    } as StaffRow)
  }
  return assertStaffActive(client, actor.id, actor.institution_id)
}

/**
 * Load a staff user, require `Active` status, and require an active branch.
 * Typical write-path gate for institution staff mutations.
 */
export async function assertStaffAndBranchActive(
  client: PoolClient,
  staffId: string,
  institutionId?: string,
): Promise<StaffWriteGateResult> {
  const staffCheck = await assertStaffActive(client, staffId, institutionId)
  if (!staffCheck.ok) {
    return {
      ok: false,
      error: staffCheck.error,
      ...(staffCheck.error === "staff_inactive" ? { staffStatus: staffCheck.status } : {}),
    }
  }

  const branchCheck = await assertBranchActive(client, staffCheck.staff.branch_id)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error,
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }

  return { ok: true, staff: staffCheck.staff }
}

/**
 * Assert the current actor is active and their branch is active.
 */
export async function assertActorAndBranchActive(
  client: PoolClient,
  actor: Pick<ActorContext, "id" | "institution_id" | "branch_id"> &
    Partial<Pick<ActorContext, "status">>,
): Promise<StaffWriteGateResult> {
  const staffCheck = await assertActorActive(client, actor)
  if (!staffCheck.ok) {
    return {
      ok: false,
      error: staffCheck.error,
      ...(staffCheck.error === "staff_inactive" ? { staffStatus: staffCheck.status } : {}),
    }
  }

  if (!actor.branch_id) {
    return { ok: false, error: "branch_not_found" }
  }

  const branchCheck = await assertBranchActive(client, actor.branch_id)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error,
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }

  return { ok: true, staff: staffCheck.staff }
}

/** HTTP status for staff/branch write-gate failures. */
export function staffWriteGateHttpStatus(error: string): number {
  if (error === "staff_not_found") return 404
  if (
    error === "staff_inactive" ||
    error === "branch_inactive" ||
    error === "branch_not_found"
  ) {
    return 403
  }
  return 403
}

/** JSON body for staff route denial responses. */
export function staffRouteDenialBody(result: {
  error: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
  message?: string
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    error: result.message || result.error,
    code: result.error,
  }
  if (result.staffStatus) payload.staff_status = result.staffStatus
  if (result.branchStatus) payload.branch_status = result.branchStatus
  return payload
}

/** Client-facing message for staff/branch write-gate failures. */
export function mapStaffWriteGateClientMessage(
  code: unknown,
  action = "complete this action",
): string {
  switch (String(code || "")) {
    case "staff_inactive":
      return `Your staff account is not active. Contact an administrator before you ${action}.`
    case "branch_inactive":
      return `Your branch is not active. Reactivate the branch before you ${action}.`
    case "branch_not_found":
      return "Your branch could not be found. Contact an administrator."
    case "staff_not_found":
      return "Staff account not found."
    default:
      return String(code || "Unexpected error")
  }
}
