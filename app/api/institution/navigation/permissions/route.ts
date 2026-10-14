import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermissions, isSuperAdmin, resolveActorContext } from "@/lib/api/rbac"

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

      const perms = await hasPermissions(client, actor, [
        "view_users",
        "view_members",
        "view_third_party_agents",
        "view_loans",
        "view_sacco_loans",
        "view_loan_products",
        "view_savings",
        "view_investments",
        "view_investment_reports",
        "view_transactions",
        "view_invoices",
        "view_bank_accouts",
        "view_grants",
        "view_unclaimed_deposits",
        "view_expenses",
        "edit_loan_policies",
        "edit_membership_policies",
        "edit_invoice_policies",
        "edit_share_policies",
        "edit_branch_financial_info",
        "edit_institution_info",
        "edit_branch_info",
        "edit_role_permissions",
        "view_chats",
      ] as const)

      const viewStaff = perms.view_users
      const viewMembers = perms.view_members
      const viewThirdPartyAgents = perms.view_third_party_agents
      const viewLoans = perms.view_loans
      const viewSaccoLoans = perms.view_sacco_loans
      const viewLoanProducts = perms.view_loan_products
      const viewSavings = perms.view_savings
      const viewInvestments = perms.view_investments
      const viewInvestmentReports = perms.view_investment_reports
      const viewTransactions = perms.view_transactions
      const viewInvoices = perms.view_invoices
      const viewBankAccounts = perms.view_bank_accouts
      const viewGrants = perms.view_grants
      const viewUnclaimedDeposits = perms.view_unclaimed_deposits
      const viewExpenses = perms.view_expenses
      const editLoanPolicies = perms.edit_loan_policies
      const editMembershipPolicies = perms.edit_membership_policies
      const editInvoicePolicies = perms.edit_invoice_policies
      const editSharePolicies = perms.edit_share_policies
      const editBranchFinancialInfo = perms.edit_branch_financial_info
      const editInstitutionInfo = perms.edit_institution_info
      const editBranchInfo = perms.edit_branch_info
      const editRolePermissions = perms.edit_role_permissions
      const viewChats = perms.view_chats

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
