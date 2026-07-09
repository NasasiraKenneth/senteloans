import type { PoolClient } from "pg"
import {
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  type ActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { canViewAnyFinanceModule } from "@/lib/finances/permissions"
import { assertActorActive, type StaffStatus } from "@/lib/staff/staff-status"

export type FinanceAccessError =
  | "user_not_linked"
  | "staff_not_found"
  | "staff_inactive"
  | "actor_branch_missing"
  | "branch_id_required"
  | "branch_not_found"
  | "branch_inactive"
  | "cross_branch_operation_forbidden"
  | "missing_permission:view_finances"
  | `missing_permission:${string}`

export type FinanceAccessDenied = {
  ok: false
  error: FinanceAccessError
  message?: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
}

export type FinanceReadAccessResult = { ok: true; actor: ActorContext } | FinanceAccessDenied

export type FinanceMutationAccessResult =
  | { ok: true; actor: ActorContext }
  | FinanceAccessDenied

export type FinanceBranchScopeResult =
  | { ok: true; branchId: string }
  | FinanceAccessDenied

const ACCESS_ERRORS = new Set<string>([
  "user_not_linked",
  "staff_not_found",
  "staff_inactive",
  "actor_branch_missing",
  "branch_id_required",
  "branch_not_found",
  "branch_inactive",
  "cross_branch_operation_forbidden",
  "missing_permission:view_finances",
])

export function isFinanceAccessError(error: string): boolean {
  return ACCESS_ERRORS.has(error) || error.startsWith("missing_permission:")
}

export type FinanceRouteError = {
  error: string
  message?: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
}

export function toFinanceRouteError(denied: FinanceAccessDenied): FinanceRouteError {
  return {
    error: denied.error,
    staffStatus: denied.staffStatus,
    branchStatus: denied.branchStatus,
  }
}

export function isFinanceRouteError(result: unknown): result is FinanceRouteError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as FinanceRouteError).error === "string"
  )
}

export function financeAccessHttpStatus(error: string): number {
  if (error === "actor_branch_missing" || error === "branch_id_required") return 400
  if (error === "staff_not_found" || error === "branch_not_found") return 404
  return 403
}

export function financeAccessBody(denied: FinanceAccessDenied): Record<string, unknown> {
  const body: Record<string, unknown> = {
    error: denied.message || denied.error,
    code: denied.error,
  }
  if (denied.staffStatus) body.staff_status = denied.staffStatus
  if (denied.branchStatus) body.branch_status = denied.branchStatus
  return body
}

export function mapFinanceAccessErrorResponse(result: FinanceRouteError): {
  status: number
  body: Record<string, unknown>
} {
  const code = String(result.error || "")
  if (isFinanceAccessError(code)) {
    return {
      status: financeAccessHttpStatus(code),
      body: financeAccessBody({
        ok: false,
        error: code as FinanceAccessError,
        message: result.message,
        staffStatus: result.staffStatus,
        branchStatus: result.branchStatus,
      }),
    }
  }
  return {
    status: code === "not_found" ? 404 : 400,
    body: { error: code, ...(result.message ? { message: result.message } : {}) },
  }
}

/** Narrow unknown runWithAuth results and map finance access denials to HTTP parts. */
export function financeAccessErrorResponseOrNull(
  result: unknown,
): { status: number; body: Record<string, unknown> } | null {
  if (!isFinanceRouteError(result) || !isFinanceAccessError(result.error)) return null
  return mapFinanceAccessErrorResponse(result)
}

async function assertActiveFinanceActor(
  client: PoolClient,
  authUserId: string,
): Promise<FinanceMutationAccessResult> {
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

  return { ok: true, actor }
}

/**
 * Read-path gate: active staff + permission(s). Super admins may read across branches.
 */
export async function assertFinanceReadAccess(
  client: PoolClient,
  authUserId: string,
  permissions: string | string[],
): Promise<FinanceReadAccessResult> {
  const access = await assertActiveFinanceActor(client, authUserId)
  if (!access.ok) return access

  const { actor } = access
  if (!isSuperAdmin(actor) && !actor.branch_id) {
    return { ok: false, error: "actor_branch_missing" }
  }

  const permissionList = Array.isArray(permissions) ? permissions : [permissions]
  const allowedResults = await Promise.all(
    permissionList.map((permission) => hasPermission(client, actor, permission)),
  )
  if (!allowedResults.some(Boolean)) {
    const permission = permissionList.length === 1 ? permissionList[0] : permissionList.join("|")
    return { ok: false, error: `missing_permission:${permission}` }
  }

  return { ok: true, actor }
}

/** Summary / cross-module read gate (any finance view permission). */
export async function assertFinanceSummaryReadAccess(
  client: PoolClient,
  authUserId: string,
): Promise<FinanceReadAccessResult> {
  const access = await assertActiveFinanceActor(client, authUserId)
  if (!access.ok) return access

  const { actor } = access
  if (!isSuperAdmin(actor) && !actor.branch_id) {
    return { ok: false, error: "actor_branch_missing" }
  }

  const allowed = await canViewAnyFinanceModule(client, actor)
  if (!allowed) return { ok: false, error: "missing_permission:view_finances" }

  return { ok: true, actor }
}

/** Permissions endpoint: active staff linked to an institution (no module permission required). */
export async function assertFinancePermissionsReadAccess(
  client: PoolClient,
  authUserId: string,
): Promise<FinanceReadAccessResult> {
  return assertActiveFinanceActor(client, authUserId)
}

/**
 * Mutation gate (step 1): active staff + permission. Branch checks run separately via
 * `assertFinanceBranchScope` once the target branch is known.
 */
export async function assertFinanceMutationAccess(
  client: PoolClient,
  authUserId: string,
  permission: string,
): Promise<FinanceMutationAccessResult> {
  const access = await assertActiveFinanceActor(client, authUserId)
  if (!access.ok) return access

  const allowed = await hasPermission(client, access.actor, permission)
  if (!allowed) return { ok: false, error: `missing_permission:${permission}` }

  return access
}

/**
 * Mutation gate (step 2): target branch must exist, be active, and match actor branch for staff.
 */
export async function assertFinanceBranchScope(
  client: PoolClient,
  actor: ActorContext,
  branchId: string | null | undefined,
): Promise<FinanceBranchScopeResult> {
  const resolvedBranchId = String(branchId || "").trim()
  if (!resolvedBranchId) return { ok: false, error: "branch_id_required" }

  const branchCheck = await assertBranchActive(client, resolvedBranchId)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error,
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }

  if (!isSuperAdmin(actor)) {
    if (!actor.branch_id) return { ok: false, error: "actor_branch_missing" }
    if (actor.branch_id !== resolvedBranchId) {
      return { ok: false, error: "cross_branch_operation_forbidden" }
    }
  }

  return { ok: true, branchId: resolvedBranchId }
}

/** Resolve write branch: staff always use actor branch; super admins use explicit selection. */
export function resolveFinanceWriteBranchId(
  actor: ActorContext,
  bodyBranchId?: string | null,
): string | null {
  if (isSuperAdmin(actor)) {
    return String(bodyBranchId || actor.branch_id || "").trim() || null
  }
  return String(actor.branch_id || "").trim() || null
}
