import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermissions } from "@/lib/api/rbac"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
     LIMIT 1`,
    [authUserId],
  )
  return actorRes.rows[0] || null
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "institution.settings.permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "institution.settings.permissions.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return null

      const role = String(actor.role || "").trim().toLowerCase()
      const actorIsAdminRole = role === "super_admin" || role === "system_admin" || role === "institution_admin"

      const perms = await hasPermissions(client, actor, [
        "edit_loan_policies",
        "edit_membership_policies",
        "edit_invoice_policies",
        "edit_share_policies",
        "edit_branch_financial_info",
        "edit_institution_info",
        "edit_branch_info",
        "edit_role_permissions",
      ] as const)
      const editLoanPolicies = perms.edit_loan_policies
      const editMembershipPolicies = perms.edit_membership_policies
      const editInvoicePolicies = perms.edit_invoice_policies
      const editSharePolicies = perms.edit_share_policies
      const editBranchFinancialInfo = perms.edit_branch_financial_info
      const editInstitutionInfo = perms.edit_institution_info
      const editBranchInfo = perms.edit_branch_info
      const editRolePermissionsRaw = perms.edit_role_permissions

      return {
        editInstitutionSettings:
          editLoanPolicies ||
          editMembershipPolicies ||
          editInvoicePolicies ||
          editSharePolicies ||
          editBranchFinancialInfo,
        editInstitutionInfo,
        editBranchInfo,
        editRolePermissions: actorIsAdminRole || editRolePermissionsRaw,
      }
    })

    if (!permissions) {
      apiLog("warn", "institution.settings.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    apiLog("info", "institution.settings.permissions.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.settings.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
