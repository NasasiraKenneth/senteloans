import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const search = (url.searchParams.get("search") || "").trim()
    const type = (url.searchParams.get("type") || "").trim()
    const mode = (url.searchParams.get("mode") || "").trim()
    const dateFrom = (
      url.searchParams.get("date_from") ||
      url.searchParams.get("dateStart") ||
      url.searchParams.get("startDate") ||
      ""
    ).trim()
    const dateTo = (
      url.searchParams.get("date_to") ||
      url.searchParams.get("dateEnd") ||
      url.searchParams.get("endDate") ||
      ""
    ).trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      let query = `
        SELECT
          t.id,
          t.transaction_number,
          t.type,
          t.amount,
          t.mode,
          t.description,
          t.balance_after,
          t.transaction_date,
          t.account_id,
          COALESCE(sa.account_number, '') AS account_number,
          $3 AS assigned_to
        FROM transactions t
        LEFT JOIN savings_accounts sa ON sa.id = t.account_id
        WHERE t.member_id = $1 AND t.institution_id = $2
      `
      const params: unknown[] = [row.id, row.institution_id, row.full_name]
      let paramIdx = 4

      if (statusParam && statusParam !== "all") {
        if (statusParam === "deposit") {
          query += ` AND (LOWER(t.type::text) LIKE '%deposit%' OR t.type::text IN ('Deposit', 'Opening Balance', 'Shares Purchase'))`
        } else if (statusParam === "withdrawal") {
          query += ` AND (LOWER(t.type::text) LIKE '%withdraw%' OR t.type::text = 'Withdrawal')`
        } else if (statusParam === "payment") {
          query += ` AND (LOWER(t.type::text) LIKE '%repay%' OR LOWER(t.type::text) LIKE '%payment%' OR t.type::text IN ('Loan Repayment', 'Fee Payment', 'Interest Payment'))`
        }
      }

      if (search) {
        query += ` AND (
          t.transaction_number ILIKE $${paramIdx}
          OR t.description ILIKE $${paramIdx}
          OR t.type::text ILIKE $${paramIdx}
          OR t.mode::text ILIKE $${paramIdx}
          OR sa.account_number ILIKE $${paramIdx}
        )`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (type && type !== "all") {
        query += ` AND LOWER(TRIM(t.type::text)) = LOWER(TRIM($${paramIdx++}))`
        params.push(type)
      }

      if (mode && mode !== "all") {
        query += ` AND LOWER(TRIM(t.mode::text)) = LOWER(TRIM($${paramIdx++}))`
        params.push(mode)
      }

      if (dateFrom) {
        query += ` AND t.transaction_date::date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND t.transaction_date::date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      query += ` ORDER BY t.transaction_date DESC, t.created_at DESC`

      const txRes = await client.query(query, params)

      const aggRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN t.type IN ('Deposit', 'Opening Balance', 'Shares Purchase') OR LOWER(t.type::text) LIKE '%deposit%' THEN t.amount ELSE 0 END), 0)::numeric AS deposits_total,
           COALESCE(SUM(CASE WHEN t.type = 'Withdrawal' OR LOWER(t.type::text) LIKE '%withdraw%' THEN t.amount ELSE 0 END), 0)::numeric AS withdrawals_total,
           COALESCE(SUM(CASE WHEN t.type IN ('Loan Repayment', 'Fee Payment', 'Interest Payment') OR LOWER(t.type::text) LIKE '%repay%' OR LOWER(t.type::text) LIKE '%payment%' THEN t.amount ELSE 0 END), 0)::numeric AS payments_total
         FROM transactions t
         WHERE t.member_id = $1 AND t.institution_id = $2`,
        [row.id, row.institution_id]
      )

      const savRes = await client.query(
        `SELECT COALESCE(SUM(total_balance), 0)::numeric AS total FROM savings_accounts WHERE member_id = $1 AND institution_id = $2`,
        [row.id, row.institution_id]
      )
      const shareRes = await client.query(
        `SELECT COALESCE(SUM(total_value), 0)::numeric AS total FROM member_shares WHERE member_id = $1`,
        [row.id]
      )

      const agg = aggRes.rows[0] || {}

      return {
        transactions: txRes.rows,
        memberName: String(row.full_name || ""),
        memberNumber: String(row.member_number || ""),
        totalSavings: Number(savRes.rows[0]?.total ?? 0),
        totalShares: Number(shareRes.rows[0]?.total ?? 0),
        depositsTotal: Number(agg.deposits_total ?? 0),
        withdrawalsTotal: Number(agg.withdrawals_total ?? 0),
        paymentsTotal: Number(agg.payments_total ?? 0),
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })

    const transactions = result.transactions.map((t: Record<string, unknown>) => ({
      id: t.id,
      account_id: t.account_id,
      transaction_number: t.transaction_number,
      memberName: result.memberName,
      type: String(t.type),
      amount: Number(t.amount || 0),
      mode: String(t.mode),
      balance: Number(t.balance_after || 0),
      date: t.transaction_date,
      description: (t.description as string) || "",
    }))

    return NextResponse.json({
      transactions,
      aggregates: {
        totalSavings: result.totalSavings,
        totalShares: result.totalShares,
        depositsTotal: result.depositsTotal,
        withdrawalsTotal: result.withdrawalsTotal,
        paymentsTotal: result.paymentsTotal,
      },
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
