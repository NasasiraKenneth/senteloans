import type { PoolClient } from "pg"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
  type ActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertActorActive, type StaffStatus } from "@/lib/staff/staff-status"

export type ExpenseReadAccessError =
  | "user_not_linked"
  | "staff_not_found"
  | "staff_inactive"
  | "actor_branch_missing"
  | `missing_permission:${string}`

export type ExpenseReadAccessDenied = {
  ok: false
  error: ExpenseReadAccessError
  staffStatus?: StaffStatus
}

export type ExpenseReadAccessResult =
  | { ok: true; actor: ActorContext }
  | ExpenseReadAccessDenied

/**
 * Read-path gate: active staff + permission(s). Super admins may read across branches.
 */
export async function assertExpenseReadAccess(
  client: PoolClient,
  authUserId: string,
  permissions: string | string[],
): Promise<ExpenseReadAccessResult> {
  const permissionList = Array.isArray(permissions) ? permissions : [permissions]
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

  if (!isSuperAdmin(actor) && !actor.branch_id) {
    return { ok: false, error: "actor_branch_missing" }
  }

  const allowedResults = await Promise.all(
    permissionList.map((permission) => hasPermission(client, actor, permission)),
  )
  if (!allowedResults.some(Boolean)) {
    const permission = permissionList.length === 1 ? permissionList[0] : permissionList.join("|")
    return { ok: false, error: `missing_permission:${permission}` }
  }

  return { ok: true, actor }
}

export function expenseScopeWhere(
  actor: Pick<ActorContext, "institution_id" | "branch_id" | "role">,
  expenseId: string,
): { where: string; values: unknown[] } {
  let where = `e.id = $1::uuid AND e.institution_id = $2::uuid`
  const values: unknown[] = [expenseId, actor.institution_id]
  if (!isSuperAdmin(actor as ActorContext)) {
    where += ` AND e.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

export function expenseReadAccessHttpStatus(error: ExpenseReadAccessError): number {
  if (error === "actor_branch_missing") return 400
  if (error === "staff_not_found") return 404
  return 403
}

export function mapExpenseReadErrorResponse(result: ExpenseRouteError): {
  status: number
  body: Record<string, unknown>
} {
  const code = String(result.error || "")
  if (code === "staff_inactive") {
    return expenseRouteDenialResponse({
      error: code,
      staffStatus: result.staffStatus,
    })
  }
  return {
    status: expenseReadAccessHttpStatus(code as ExpenseReadAccessError),
    body: { error: code },
  }
}

export function mapExpenseMutationErrorResponse(
  result: ExpenseRouteError,
  statusByCode: Record<string, number> = {},
): { status: number; body: Record<string, unknown> } {
  const code = String(result.error || "")
  if (isExpenseWriteAccessError(code)) {
    return expenseRouteDenialResponse(result)
  }
  const defaultStatus =
    code === "not_found" || code === "funding_not_found" || code === "cashflow_not_found" ? 404 : 400
  const status = statusByCode[code] ?? defaultStatus
  const body: Record<string, unknown> = { error: code }
  if (result.message?.trim()) body.message = result.message.trim()
  return { status, body }
}

export type ExpenseWriteAccessError =
  | "user_not_linked"
  | "staff_not_found"
  | "staff_inactive"
  | typeof SUPER_ADMIN_WRITE_BLOCKED
  | "actor_branch_missing"
  | "branch_not_found"
  | "branch_inactive"
  | `missing_permission:${string}`

export type ExpenseWriteAccessDenied = {
  ok: false
  error: ExpenseWriteAccessError
  message?: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
}

export type ExpenseWriteAccessResult =
  | { ok: true; actor: ActorContext & { branch_id: string } }
  | ExpenseWriteAccessDenied

/**
 * Shared write-path gate for /api/institution/expenses mutations:
 * active staff, non–super-admin, active branch, and branch-scoped permission.
 */
export async function assertExpenseWriteAccess(
  client: PoolClient,
  authUserId: string,
  permission: string,
): Promise<ExpenseWriteAccessResult> {
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

export function expenseWriteAccessHttpStatus(denied: ExpenseWriteAccessDenied): number {
  if (denied.error === "actor_branch_missing") return 400
  if (denied.error === "staff_not_found") return 404
  return 403
}

export function expenseWriteAccessBody(denied: ExpenseWriteAccessDenied): Record<string, unknown> {
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

export function isExpenseWriteAccessError(error: string): boolean {
  return WRITE_ACCESS_ERRORS.has(error) || error.startsWith("missing_permission:")
}

export type ExpenseRouteError = {
  error: string
  message?: string
  staffStatus?: StaffStatus
  branchStatus?: BranchStatus
}

export function isExpenseRouteError(result: unknown): result is ExpenseRouteError {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as ExpenseRouteError).error === "string"
  )
}

export function expenseRouteDenialResponse(result: ExpenseRouteError): {
  status: number
  body: Record<string, unknown>
} {
  const status = isExpenseWriteAccessError(result.error)
    ? expenseWriteAccessHttpStatus({ ok: false, error: result.error as ExpenseWriteAccessError })
    : result.error === "not_found"
      ? 404
      : 400
  const body =
    result.message && isExpenseWriteAccessError(result.error)
      ? expenseWriteAccessBody({
          ok: false,
          error: result.error as ExpenseWriteAccessError,
          message: result.message,
          staffStatus: result.staffStatus,
          branchStatus: result.branchStatus,
        })
      : { error: result.error, ...(result.message ? { message: result.message } : {}) }
  return { status, body }
}
