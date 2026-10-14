import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { isSuperAdmin, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { dashboardPeopleLabelForInstitutionType } from "@/lib/dashboard/people-model"
import { readInstitutionCurrency } from "@/lib/institution-branch-config"

const ACTIVE_LOAN_STATUSES = ["Partially Disbursed", "Fully Disbursed", "Active"] as const

/** GET /api/institution/dashboard-stats — branch-scoped stats + recent loans + recent members */
export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "dashboard_stats.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "dashboard_stats.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const branchesRaw = (searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const instId = actor.institution_id

      const instRes = await client.query(`SELECT type FROM institutions WHERE id = $1 LIMIT 1`, [instId])
      const institutionType = String(instRes.rows[0]?.type || "SACCO")
      const peopleLabel = dashboardPeopleLabelForInstitutionType(institutionType)

      const currencyBranchId = actor.branch_id || selectedBranchIds[0] || null
      let currency = "UGX"
      if (currencyBranchId) {
        const cfgRes = await client.query(`SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`, [currencyBranchId])
        currency = readInstitutionCurrency(
          cfgRes.rows[0] ? { currency: cfgRes.rows[0].currency } : null,
          "UGX",
        )
      } else if (isSuperAdmin(actor)) {
        const cfgRes = await client.query(
          `SELECT currency FROM config c
           JOIN branches b ON b.id = c.branch_id
           WHERE b.institution_id = $1
           ORDER BY b.name ASC
           LIMIT 1`,
          [instId],
        )
        currency = readInstitutionCurrency(
          cfgRes.rows[0] ? { currency: cfgRes.rows[0].currency } : null,
          "UGX",
        )
      }

      const membersScope = scopeWhere({ tableAlias: "m", actor, selectedBranchIds, startIndex: 1 })
      const loansScope = scopeWhere({ tableAlias: "l", actor, selectedBranchIds, startIndex: 1 })
      const txScope = scopeWhere({ tableAlias: "t", actor, selectedBranchIds, startIndex: 1 })
      const savingsScope = scopeWhere({ tableAlias: "sa", actor, selectedBranchIds, startIndex: 1 })

      const membersParams = membersScope.values
      const loansParams = loansScope.values
      const txParams = txScope.values
      const savingsParams = savingsScope.values

      const activeLoanList = ACTIVE_LOAN_STATUSES.map((s) => `'${s}'`).join(", ")

      const membersRes = await client.query(
        `SELECT COUNT(*)::int AS total,
                (COUNT(*) FILTER (WHERE m.status = 'Active'))::int AS active,
                (COUNT(*) FILTER (WHERE m.status = 'Inactive'))::int AS inactive
         FROM members m
         WHERE ${membersScope.where}`,
        membersParams,
      )
      const loansRes = await client.query(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(outstanding_balance), 0)::numeric AS outstanding,
                (COUNT(*) FILTER (WHERE status IN (${activeLoanList})))::int AS active_loans,
                (COUNT(*) FILTER (WHERE approved_at IS NOT NULL))::int AS approved_loans,
                COALESCE(AVG(principal_amount) FILTER (WHERE status IN (${activeLoanList})), 0)::numeric AS avg_principal
         FROM loans l
         WHERE ${loansScope.where}`,
        loansParams,
      )
      const txRes = await client.query(
        `SELECT COUNT(*)::int AS tx_count FROM transactions t
         WHERE ${txScope.where}
           AND t.transaction_date >= date_trunc('month', CURRENT_TIMESTAMP)`,
        txParams,
      )
      const savingsRes = await client.query(
        `SELECT COALESCE(SUM(sa.total_balance), 0)::numeric AS total
         FROM savings_accounts sa
         WHERE ${savingsScope.where}`,
        savingsParams,
      )
      const portfolioRes = await client.query(
        `SELECT
           COALESCE(SUM(outstanding_balance) FILTER (WHERE status = 'Defaulted'), 0)::numeric AS npl_outstanding,
           COALESCE(SUM(outstanding_balance) FILTER (WHERE status IN (${activeLoanList}, 'Defaulted')), 0)::numeric AS portfolio_outstanding
         FROM loans l
         WHERE ${loansScope.where}`,
        loansParams,
      )
      const collectionRes = await client.query(
        `SELECT
           COALESCE(SUM(lr.amount_due) FILTER (
             WHERE lr.due_date >= date_trunc('month', CURRENT_DATE)::date
               AND lr.due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
           ), 0)::numeric AS due_this_month,
           COALESCE(SUM(lr.amount_paid) FILTER (
             WHERE lr.payment_date >= date_trunc('month', CURRENT_DATE)::date
               AND lr.payment_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
           ), 0)::numeric AS collected_this_month
         FROM loan_repayments lr
         INNER JOIN loans l ON l.id = lr.loan_id
         WHERE ${loansScope.where}`,
        loansParams,
      )
      const overdueRes = await client.query(
        `SELECT COUNT(DISTINCT l.id)::int AS overdue_count
         FROM loans l
         INNER JOIN loan_repayments lr ON lr.loan_id = l.id
         WHERE ${loansScope.where}
           AND l.status IN (${activeLoanList})
           AND lr.status != 'Paid'
           AND lr.due_date < CURRENT_DATE`,
        loansParams,
      )

      const totalMembers = membersRes.rows[0]?.total ?? 0
      const activeMembers = membersRes.rows[0]?.active ?? 0
      const inactiveMembers = membersRes.rows[0]?.inactive ?? 0

      const loansRow = loansRes.rows[0]
      const outstandingLoans = Number(loansRow?.outstanding ?? 0)
      const activeLoansCount = Number(loansRow?.active_loans ?? 0)
      const totalApprovedLoans = Number(loansRow?.approved_loans ?? 0)
      const averageLoanSize = Number(loansRow?.avg_principal ?? 0)
      const totalSavingsPortfolio = Number(savingsRes.rows[0]?.total ?? 0)
      const totalTransactionsThisMonth = txRes.rows[0]?.tx_count ?? 0
      const overdueLoansCount = overdueRes.rows[0]?.overdue_count ?? 0

      const nplOutstanding = Number(portfolioRes.rows[0]?.npl_outstanding ?? 0)
      const portfolioOutstanding = Number(portfolioRes.rows[0]?.portfolio_outstanding ?? 0)
      const nplRatio =
        portfolioOutstanding > 0 ? Math.round((nplOutstanding / portfolioOutstanding) * 1000) / 10 : 0

      const dueThisMonth = Number(collectionRes.rows[0]?.due_this_month ?? 0)
      const collectedThisMonth = Number(collectionRes.rows[0]?.collected_this_month ?? 0)
      const monthlyCollectionEfficiency =
        dueThisMonth > 0 ? Math.min(100, Math.round((collectedThisMonth / dueThisMonth) * 1000) / 10) : 0

      const newMembersRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM members m
         WHERE ${membersScope.where}
           AND m.created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
        membersParams,
      )
      const loansApprovedRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM loans l
         WHERE ${loansScope.where}
           AND l.status IN ('Approved','Partially Disbursed','Fully Disbursed','Active')
           AND l.approved_at IS NOT NULL
           AND l.approved_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
        loansParams,
      )

      const memberRetentionRate =
        totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 1000) / 10 : 0

      const stats = {
        peopleLabel,
        currency,
        totalMembers,
        activeMembers,
        inactiveMembers,
        newMembersThisMonth: newMembersRes.rows[0]?.c ?? 0,
        memberRetentionRate,
        totalLoanPortfolio: outstandingLoans,
        outstandingLoans,
        activeLoansCount,
        totalApprovedLoans,
        overdueLoansCount,
        averageLoanSize,
        totalSavingsPortfolio,
        totalTransactionsThisMonth,
        loansApprovedThisMonth: loansApprovedRes.rows[0]?.c ?? 0,
        nplRatio,
        monthlyCollectionEfficiency,
        collectedThisMonth,
        dueThisMonth,
      }

      const recentLoansRes = await client.query(
        `SELECT l.id, l.application_id, l.principal_amount, l.status, l.application_date,
                m.full_name AS client_name,
                p.product_name AS product_name
         FROM loans l
         JOIN members m ON m.id = l.member_id AND m.institution_id = l.institution_id
         LEFT JOIN loan_products p ON p.id = l.loan_product_id
         WHERE ${loansScope.where}
         ORDER BY l.application_date DESC NULLS LAST, l.created_at DESC
         LIMIT 5`,
        loansParams,
      )
      const recentLoans = recentLoansRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        applicationId: r.application_id,
        principalAmount: Number(r.principal_amount),
        status: r.status,
        applicationDate: r.application_date,
        clientName: r.client_name,
        loanProduct: r.product_name || "Loan",
      }))

      const recentPeopleRes = await client.query(
        `SELECT m.id, m.member_number, m.full_name, m.district, m.occupation, m.kyc_status, m.status
         FROM members m
         WHERE ${membersScope.where}
         ORDER BY m.created_at DESC
         LIMIT 5`,
        membersParams,
      )

      const recentMembers = recentPeopleRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        clientNumber: r.member_number,
        fullName: r.full_name,
        district: r.district || "",
        occupation: r.occupation || "",
        kycStatus: r.kyc_status,
        status: r.status,
      }))

      return { stats, recentLoans, recentMembers }
    })

    if (result && "error" in result) {
      const status =
        result.error === "actor_branch_missing" ? 400 : result.error === "user_not_linked" ? 403 : 403
      apiLog("warn", "dashboard_stats.denied", { method: "GET", apiPath, status, error: result.error })
      return NextResponse.json({ error: result.error }, { status })
    }

    apiLog("info", "dashboard_stats.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "dashboard_stats.error", { method: "GET", apiPath, status: 500, error: err?.message ?? "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
