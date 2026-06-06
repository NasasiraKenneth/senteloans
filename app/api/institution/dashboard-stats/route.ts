import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

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
     WHERE u.supabase_user_id = $1
       AND u.status = 'Active'
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

/** Branch filter: staff see their branch only; super_admin sees all branches or ?branches=id1,id2 */
function branchPredicate(alias: string, isSuperAdmin: boolean, branchId: string | null, selectedBranchIds: string[]) {
  if (!isSuperAdmin) {
    return { sql: ` AND ${alias}.branch_id = $2`, params: [branchId] as unknown[] }
  }
  if (selectedBranchIds.length > 0) {
    return { sql: ` AND ${alias}.branch_id = ANY($2::uuid[])`, params: [selectedBranchIds] as unknown[] }
  }
  return { sql: "", params: [] as unknown[] }
}

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

      const role = String(actor.role || "").trim().toLowerCase()
      const isSuperAdmin = role === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const instId = actor.institution_id

      const clientsBranch = branchPredicate("c", isSuperAdmin, actor.branch_id, selectedBranchIds)
      const membersBranch = branchPredicate("m", isSuperAdmin, actor.branch_id, selectedBranchIds)
      const loansBranch = branchPredicate("l", isSuperAdmin, actor.branch_id, selectedBranchIds)
      const txBranch = branchPredicate("t", isSuperAdmin, actor.branch_id, selectedBranchIds)
      const savingsBranch = branchPredicate("sa", isSuperAdmin, actor.branch_id, selectedBranchIds)

      const clientsParams = [instId, ...clientsBranch.params]
      const membersParams = [instId, ...membersBranch.params]
      const loansParams = [instId, ...loansBranch.params]
      const txParams = [instId, ...txBranch.params]
      const savingsParams = [instId, ...savingsBranch.params]

      const [clientsRes, membersRes, loansRes, txRes, savingsRes] = await Promise.all([
        client.query(
          `SELECT COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE c.status = 'Active'))::int AS active
           FROM clients c
           WHERE c.institution_id = $1${clientsBranch.sql}`,
          clientsParams
        ),
        client.query(
          `SELECT COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE m.status = 'Active'))::int AS active
           FROM members m
           WHERE m.institution_id = $1${membersBranch.sql}`,
          membersParams
        ),
        client.query(
          `SELECT COUNT(*)::int AS total,
                  COALESCE(SUM(outstanding_balance), 0)::numeric AS outstanding,
                  (COUNT(*) FILTER (
                    WHERE status IN ('Partially Disbursed','Fully Disbursed','Active')
                  ))::int AS active_loans
           FROM loans l
           WHERE l.institution_id = $1${loansBranch.sql}`,
          loansParams
        ),
        client.query(
          `SELECT COUNT(*)::int AS tx_count FROM transactions t
           WHERE t.institution_id = $1
             AND t.transaction_date >= date_trunc('month', CURRENT_TIMESTAMP)${txBranch.sql}`,
          txParams
        ),
        client.query(
          `SELECT COALESCE(SUM(sa.total_balance), 0)::numeric AS total
           FROM savings_accounts sa
           WHERE sa.institution_id = $1${savingsBranch.sql}`,
          savingsParams
        ),
      ])

      const totalClients = clientsRes.rows[0]?.total ?? 0
      const activeClients = clientsRes.rows[0]?.active ?? 0
      const totalMembers = membersRes.rows[0]?.total ?? 0
      const activeMembers = membersRes.rows[0]?.active ?? 0

      const loansRow = loansRes.rows[0]
      const totalLoanPortfolio = Number(loansRow?.outstanding ?? 0)
      const outstandingLoans = totalLoanPortfolio
      const totalSavingsPortfolio = Number(savingsRes.rows[0]?.total ?? 0)
      const totalTransactionsThisMonth = txRes.rows[0]?.tx_count ?? 0

      const newClientsRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM clients c
         WHERE c.institution_id = $1 AND c.created_at >= date_trunc('month', CURRENT_TIMESTAMP)${clientsBranch.sql}`,
        clientsParams
      )
      const newMembersRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM members m
         WHERE m.institution_id = $1 AND m.created_at >= date_trunc('month', CURRENT_TIMESTAMP)${membersBranch.sql}`,
        membersParams
      )
      const loansApprovedRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM loans l
         WHERE l.institution_id = $1
           AND l.status IN ('Approved','Partially Disbursed','Fully Disbursed','Active')
           AND l.approved_at IS NOT NULL
           AND l.approved_at >= date_trunc('month', CURRENT_TIMESTAMP)${loansBranch.sql}`,
        loansParams
      )

      const totalPrincipalRes = await client.query(
        `SELECT COALESCE(SUM(l.principal_amount), 0)::numeric AS s FROM loans l WHERE l.institution_id = $1${loansBranch.sql}`,
        loansParams
      )
      const totalPrincipal = Number(totalPrincipalRes.rows[0]?.s ?? 0)
      const nplRatio =
        totalPrincipal > 0
          ? Math.round((Number(loansRow?.outstanding ?? 0) / totalPrincipal) * 100 * 10) / 10
          : 0

      const stats = {
        totalClients,
        activeClients,
        totalMembers,
        activeMembers,
        totalLoanPortfolio,
        outstandingLoans,
        totalSavingsPortfolio,
        totalTransactionsThisMonth,
        newClientsThisMonth: newClientsRes.rows[0]?.c ?? 0,
        newMembersThisMonth: newMembersRes.rows[0]?.c ?? 0,
        loansApprovedThisMonth: loansApprovedRes.rows[0]?.c ?? 0,
        nplRatio,
        monthlyCollectionEfficiency: 92,
      }

      const recentLoansRes = await client.query(
        `SELECT l.id, l.application_id, l.principal_amount, l.status, l.application_date,
                m.full_name AS client_name, p.product_name AS product_name
         FROM loans l
         JOIN members m ON m.id = l.member_id AND m.institution_id = l.institution_id
         LEFT JOIN loan_products p ON p.id = l.loan_product_id
         WHERE l.institution_id = $1${loansBranch.sql}
         ORDER BY l.application_date DESC NULLS LAST, l.created_at DESC
         LIMIT 5`,
        loansParams
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

      const recentMembersRes = await client.query(
        `SELECT m.id, m.member_number, m.full_name, m.district, m.occupation, m.kyc_status, m.status
         FROM members m
         WHERE m.institution_id = $1${membersBranch.sql}
         ORDER BY m.created_at DESC
         LIMIT 5`,
        membersParams
      )
      const recentMembers = recentMembersRes.rows.map((r: Record<string, unknown>) => ({
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
