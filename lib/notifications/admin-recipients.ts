import type { PoolClient } from "pg"

/**
 * Roles that should receive operational notifications (pending loan approvals,
 * pending KYC, etc.). Normalized to the same casing produced by the role lookup
 * in `lib/api/rbac.ts` and `lib/auth.ts`.
 */
export const ADMIN_NOTIFY_ROLES = [
  "system_admin",
  "super_admin",
  "institution_admin",
  "manager",
  "loan_officer",
] as const

export type AdminNotifyRole = (typeof ADMIN_NOTIFY_ROLES)[number]

export interface AdminRecipient {
  id: string
  branch_id: string | null
}

export interface GetAdminRecipientsOptions {
  /** Exclude a user id from the result (typically the actor that triggered the event). */
  excludeUserId?: string | null
  /**
   * If true, only return staff whose branch_id matches `branchId`.
   * Default false (cross-branch staff still see institution-wide alerts).
   */
  restrictToBranch?: boolean
  /** Required when restrictToBranch is true. */
  branchId?: string | null
  /**
   * Roles to include. Defaults to the full ADMIN_NOTIFY_ROLES list.
   */
  roles?: readonly AdminNotifyRole[]
}

/**
 * Single source of truth for "who in the institution should be alerted to an
 * operational event". Uses the senteloans_roles join (not the legacy
 * senteloans_users.role TEXT column) and a consistent normalized role naming.
 */
export async function getInstitutionAdminRecipients(
  client: PoolClient,
  institutionId: string,
  opts: GetAdminRecipientsOptions = {}
): Promise<AdminRecipient[]> {
  const roles = opts.roles ?? ADMIN_NOTIFY_ROLES
  if (roles.length === 0) return []

  // Map normalized role -> source role name in senteloans_roles
  // (mirrors the CASE in rbac.ts / auth.ts so the mapping is reversible).
  const sourceNames: string[] = []
  for (const role of roles) {
    switch (role) {
      case "system_admin":
        sourceNames.push("System Admin")
        break
      case "super_admin":
        sourceNames.push("Super Admin")
        break
      case "institution_admin":
        sourceNames.push("Admin")
        break
      case "manager":
        sourceNames.push("Manager")
        break
      case "loan_officer":
        sourceNames.push("Loan Officer")
        break
    }
  }

  const params: unknown[] = [institutionId, sourceNames]
  let where = `u.institution_id = $1
       AND u.status = 'Active'
       AND r.name = ANY($2::text[])`
  if (opts.excludeUserId) {
    params.push(opts.excludeUserId)
    where += ` AND u.id != $${params.length}`
  }
  if (opts.restrictToBranch && opts.branchId) {
    params.push(opts.branchId)
    where += ` AND u.branch_id = $${params.length}`
  }

  const res = await client.query<AdminRecipient>(
    `SELECT u.id, u.branch_id
       FROM senteloans_users u
       JOIN senteloans_roles r ON r.id = u.role_id
      WHERE ${where}`,
    params
  )
  return res.rows
}
