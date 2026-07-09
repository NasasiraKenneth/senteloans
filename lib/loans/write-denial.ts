import { SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"

type LoanWriteDenial = {
  error: string
  message?: string
  staffStatus?: string
  branchStatus?: string
  memberStatus?: string
}

export function loanWriteDenialStatus(errorCode: string): number {
  if (errorCode === "staff_not_found" || errorCode === "not_found") return 404
  if (
    errorCode === "missing_permission:create_loan" ||
    errorCode.startsWith("missing_permission:") ||
    errorCode === SUPER_ADMIN_WRITE_BLOCKED ||
    errorCode === "cross_tenant_operation_forbidden" ||
    errorCode === "cross_branch_operation_forbidden" ||
    errorCode === "user_not_linked" ||
    errorCode === "staff_inactive" ||
    errorCode === "branch_inactive" ||
    errorCode === "branch_not_found" ||
    errorCode === "member_inactive" ||
    errorCode === "actor_branch_missing"
  ) {
    return 403
  }
  return 400
}

export function loanWriteDenialBody(result: LoanWriteDenial): Record<string, unknown> {
  const errorCode = String(result.error || "")
  const payload: Record<string, unknown> = {
    error: result.message || errorCode,
    code: errorCode,
  }
  if (result.branchStatus) payload.branch_status = result.branchStatus
  if (result.staffStatus) payload.staff_status = result.staffStatus
  if (result.memberStatus) payload.member_status = result.memberStatus
  return payload
}
