import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "navigation.permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "navigation.permissions.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return null

      const [
        viewStaff,
        viewMembers,
        viewThirdPartyAgents,
        viewLoans,
        viewSaccoLoans,
        viewLoanProducts,
        viewSavings,
        viewInvestments,
        viewInvestmentReports,
        viewTransactions,
        viewInvoices,
        viewBankAccounts,
        viewGrants,
        viewUnclaimedDeposits,
        viewExpenses,
        editLoanPolicies,
        editMembershipPolicies,
        editInvoicePolicies,
        editSharePolicies,
        editBranchFinancialInfo,
        editInstitutionInfo,
        editBranchInfo,
        editRolePermissions,
        viewChats,
      ] = await Promise.all([
        hasPermission(client, actor, "view_users"),
        hasPermission(client, actor, "view_members"),
        hasPermission(client, actor, "view_third_party_agents"),
        hasPermission(client, actor, "view_loans"),
        hasPermission(client, actor, "view_sacco_loans"),
        hasPermission(client, actor, "view_loan_products"),
        hasPermission(client, actor, "view_savings"),
        hasPermission(client, actor, "view_investments"),
        hasPermission(client, actor, "view_investment_reports"),
        hasPermission(client, actor, "view_transactions"),
        hasPermission(client, actor, "view_invoices"),
        hasPermission(client, actor, "view_bank_accouts"),
        hasPermission(client, actor, "view_grants"),
        hasPermission(client, actor, "view_unclaimed_deposits"),
        hasPermission(client, actor, "view_expenses"),
        hasPermission(client, actor, "edit_loan_policies"),
        hasPermission(client, actor, "edit_membership_policies"),
        hasPermission(client, actor, "edit_invoice_policies"),
        hasPermission(client, actor, "edit_share_policies"),
        hasPermission(client, actor, "edit_branch_financial_info"),
        hasPermission(client, actor, "edit_institution_info"),
        hasPermission(client, actor, "edit_branch_info"),
        hasPermission(client, actor, "edit_role_permissions"),
        hasPermission(client, actor, "view_chats"),
      ])

      const role = String(actor.role || "").trim().toLowerCase()
      const actorIsAdminRole = role === "super_admin" || role === "system_admin" || role === "institution_admin"

      const viewFinances = viewBankAccounts || viewGrants || viewUnclaimedDeposits
      const viewReports =
        viewLoans || viewSavings || viewInvoices || viewSaccoLoans || viewInvestmentReports || viewTransactions
      const viewSettings =
        actorIsAdminRole ||
        editLoanPolicies ||
        editMembershipPolicies ||
        editInvoicePolicies ||
        editSharePolicies ||
        editBranchFinancialInfo ||
        editInstitutionInfo ||
        editBranchInfo ||
        editRolePermissions

      const branches = isSuperAdmin(actor)
        ? (
            await client.query(
              `SELECT id, name
               FROM branches
               WHERE institution_id = $1
               ORDER BY name ASC`,
              [actor.institution_id],
            )
          ).rows.map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }))
        : []

      return {
        viewStaff,
        viewMembers,
        viewThirdPartyAgents,
        viewLoans,
        viewSaccoLoans,
        viewLoanProducts,
        viewSavings,
        viewInvestments,
        viewInvestmentReports,
        viewTransactions,
        viewInvoices,
        viewFinances,
        viewExpenses,
        viewReports,
        viewSettings,
        viewChats,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
      }
    })

    if (!permissions) {
      apiLog("warn", "navigation.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    apiLog("info", "navigation.permissions.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "navigation.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
