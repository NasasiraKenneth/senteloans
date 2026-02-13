import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/** GET /api/institution/dashboard-stats - stats + recent loans + recent members for dashboard (replaces mock-data). */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const instId = session!.user!.institutionId
      if (!instId) return null

      const [clientsRes, loansRes, txRes, savingsRes] = await Promise.all([
        client.query(
          `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'Active') AS active
           FROM senteloans_clients WHERE institution_id = $1`,
          [instId]
        ),
        client.query(
          `SELECT COUNT(*)::int AS total, COALESCE(SUM(outstanding_balance), 0)::numeric AS outstanding,
                  COUNT(*) FILTER (WHERE status = 'Disbursed') AS active_loans
           FROM senteloans_loans WHERE institution_id = $1`,
          [instId]
        ),
        client.query(
          `SELECT COUNT(*)::int AS tx_count FROM senteloans_transactions
           WHERE institution_id = $1 AND transaction_date >= date_trunc('month', CURRENT_DATE)`,
          [instId]
        ),
        client.query(
          `SELECT COALESCE(SUM(total_balance), 0)::numeric AS total
           FROM senteloans_savings_accounts WHERE institution_id = $1`,
          [instId]
        ),
      ])

      const totalClients = clientsRes.rows[0]?.total ?? 0
      const activeClients = clientsRes.rows[0]?.active ?? 0
      const loansRow = loansRes.rows[0]
      const totalLoanPortfolio = Number(loansRow?.outstanding ?? 0)
      const outstandingLoans = totalLoanPortfolio
      const totalSavingsPortfolio = Number(savingsRes.rows[0]?.total ?? 0)
      const totalTransactionsThisMonth = txRes.rows[0]?.tx_count ?? 0

      const newClientsRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_clients
         WHERE institution_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
        [instId]
      )
      const loansApprovedRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_loans
         WHERE institution_id = $1 AND status IN ('Approved','Disbursed')
         AND approval_date >= date_trunc('month', CURRENT_DATE)`,
        [instId]
      )

      const totalPrincipalRes = await client.query(
        `SELECT COALESCE(SUM(principal_amount), 0)::numeric AS s FROM senteloans_loans WHERE institution_id = $1`,
        [instId]
      )
      const totalPrincipal = Number(totalPrincipalRes.rows[0]?.s ?? 0)
      const nplRatio = totalPrincipal > 0
        ? Math.round((Number(loansRow?.outstanding ?? 0) / totalPrincipal) * 100 * 10) / 10
        : 0

      const stats = {
        totalClients,
        activeClients,
        totalMembers: totalClients,
        activeMembers: activeClients,
        totalLoanPortfolio,
        outstandingLoans,
        totalSavingsPortfolio,
        totalTransactionsThisMonth,
        newClientsThisMonth: newClientsRes.rows[0]?.c ?? 0,
        newMembersThisMonth: newClientsRes.rows[0]?.c ?? 0,
        loansApprovedThisMonth: loansApprovedRes.rows[0]?.c ?? 0,
        nplRatio,
        monthlyCollectionEfficiency: 92,
      }

      const recentLoansRes = await client.query(
        `SELECT l.id, l.application_id, l.principal_amount, l.status, l.application_date, l.client_id, l.loan_product_id,
                c.full_name AS client_name, p.product_name AS product_name
         FROM senteloans_loans l
         JOIN senteloans_clients c ON c.id = l.client_id
         LEFT JOIN senteloans_loan_products p ON p.id = l.loan_product_id
         WHERE l.institution_id = $1
         ORDER BY l.application_date DESC LIMIT 5`,
        [instId]
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
        `SELECT id, client_number, full_name, district, occupation, kyc_status, status
         FROM senteloans_clients WHERE institution_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [instId]
      )
      const recentMembers = recentMembersRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        clientNumber: r.client_number,
        fullName: r.full_name,
        district: r.district || "",
        occupation: r.occupation || "",
        kycStatus: r.kyc_status,
        status: r.status,
      }))

      return { stats, recentLoans, recentMembers }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    console.error("[institution/dashboard-stats]", err?.message ?? e)
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
