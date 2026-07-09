import type { PoolClient } from "pg"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
  type ActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertActorActive, type StaffStatus } from "@/lib/staff/staff-status"

export type InvestmentWriteAccessError =
  | "user_not_linked"
  | "staff_not_found"
  | "staff_inactive"
  | typeof SUPER_ADMIN_WRITE_BLOCKED
  | "actor_branch_missing"
  | "branch_not_found"
  | "branch_inactive"
  | `missing_permission:${string}`

export type InvestmentWriteAccessDenied = {
  ok: false
  error: InvestmentWriteAccessError
  message?: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
}

export type InvestmentWriteAccessResult =
  | { ok: true; actor: ActorContext & { branch_id: string } }
  | InvestmentWriteAccessDenied

/**
 * Shared write-path gate for /api/institution/investments mutations:
 * active staff, non–super-admin, active branch, and branch-scoped permission.
 */
export async function assertInvestmentWriteAccess(
  client: PoolClient,
  authUserId: string,
  permission: string,
): Promise<InvestmentWriteAccessResult> {
  const actor = await resolveActorContext(client, authUserId, { activeOnly: false })
  if (!actor?.institution_id) return { ok: false, error: "user_not_linked" }

  const staffCheck = await assertActorActive(client, actor)
  if (!staffCheck.ok) {
    return {
      ok: false,
      error: staffCheck.error,
      ...(staffCheck.error === "staff_inactive" ? { staffStatus: staffCheck.status } : {}),
    }
  }

  const writeGuard = assertNotSuperAdmin(actor)
  if (!writeGuard.ok) {
    return { ok: false, error: writeGuard.error, message: writeGuard.message }
  }

  if (!actor.branch_id) return { ok: false, error: "actor_branch_missing" }

  const branchCheck = await assertBranchActive(client, actor.branch_id)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error,
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }

  const allowed = await hasPermission(client, actor, permission)
  if (!allowed) return { ok: false, error: `missing_permission:${permission}` }

  return { ok: true, actor: { ...actor, branch_id: actor.branch_id } }
}

export function investmentWriteAccessHttpStatus(
  denied: InvestmentWriteAccessDenied,
): number {
  if (denied.error === "actor_branch_missing") return 400
  if (denied.error === "staff_not_found") return 404
  return 403
}

export function investmentWriteAccessBody(
  denied: InvestmentWriteAccessDenied,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    error: denied.message || denied.error,
    code: denied.error,
  }
  if (denied.staffStatus) body.staff_status = denied.staffStatus
  if (denied.branchStatus) body.branch_status = denied.branchStatus
  return body
}

const WRITE_ACCESS_ERRORS = new Set<string>([
  "user_not_linked",
  "staff_not_found",
  "staff_inactive",
  SUPER_ADMIN_WRITE_BLOCKED,
  "actor_branch_missing",
  "branch_not_found",
  "branch_inactive",
])

export function isInvestmentWriteAccessError(error: string): boolean {
  return WRITE_ACCESS_ERRORS.has(error) || error.startsWith("missing_permission:")
}

export type InvestmentRouteError = {
  error: string
  message?: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
}

/** Narrow runWithAuth unions where success payloads omit `error`. */
export function isInvestmentRouteError(result: unknown): result is InvestmentRouteError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as InvestmentRouteError).error === "string"
  )
}

/** Map a route-level denial (write gate or business rule) to HTTP status + JSON body. */
export function investmentRouteDenialResponse(result: InvestmentRouteError): { status: number; body: Record<string, unknown> } {
  const status =
    result.error === "investment_not_found" || result.error === "partner_not_found"
      ? 404
      : isInvestmentWriteAccessError(result.error)
        ? investmentWriteAccessHttpStatus({ ok: false, error: result.error as InvestmentWriteAccessError })
        : 403
  const body =
    result.message && isInvestmentWriteAccessError(result.error)
      ? investmentWriteAccessBody({
          ok: false,
          error: result.error as InvestmentWriteAccessError,
          message: result.message,
          staffStatus: result.staffStatus,
          branchStatus: result.branchStatus,
        })
      : { error: result.error }
  return { status, body }
}
