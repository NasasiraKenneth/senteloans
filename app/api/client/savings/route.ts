import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) {
      return NextResponse.json({ error: "client_only" }, { status: 403 })
    }

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const accountTypeParam = (url.searchParams.get("account_type") || "").trim()
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
      const member = clientRes.rows[0]
      if (!member) return null

      let query = `
        SELECT 
          id, 
          account_number, 
          account_type::text AS account_type, 
          available_balance, 
          total_balance, 
          status::text AS status, 
          open_date, 
          last_transaction_date,
          member_id,
          institution_id
        FROM savings_accounts 
        WHERE member_id = $1 AND institution_id = $2
      `
      const params: unknown[] = [member.id, member.institution_id]
      let paramIdx = 3

      if (statusParam && statusParam !== "all") {
        query += ` AND LOWER(TRIM(status::text)) = $${paramIdx++}`
        params.push(statusParam)
      }

      if (accountTypeParam && accountTypeParam !== "all") {
        const types = accountTypeParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
        if (types.length > 0) {
          query += ` AND LOWER(TRIM(account_type::text)) = ANY($${paramIdx++})`
          params.push(types)
        }
      }

      if (search) {
        query += ` AND (account_number ILIKE $${paramIdx} OR account_type::text ILIKE $${paramIdx} OR status::text ILIKE $${paramIdx})`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (dateFrom) {
        query += ` AND open_date::date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND open_date::date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      query += ` ORDER BY open_date DESC, created_at DESC`

      const accRes = await client.query(query, params)

      // Summary statistics across all member's accounts
      const aggRes = await client.query(
        `SELECT 
           COALESCE(SUM(available_balance), 0)::numeric AS total_available,
           COALESCE(SUM(total_balance), 0)::numeric AS total_savings,
           COALESCE(AVG(total_balance), 0)::numeric AS avg_balance,
           COUNT(*) FILTER (WHERE LOWER(TRIM(status::text)) = 'active')::int AS active_count,
           COUNT(*)::int AS total_count
         FROM savings_accounts 
         WHERE member_id = $1 AND institution_id = $2`,
        [member.id, member.institution_id]
      )

      const txAggRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN t.type::text IN ('Deposit', 'Opening Balance', 'Shares Purchase') OR LOWER(t.type::text) LIKE '%deposit%' THEN t.amount ELSE 0 END), 0)::numeric AS lifetime_deposited,
           COALESCE(SUM(CASE WHEN t.type::text = 'Withdrawal' OR LOWER(t.type::text) LIKE '%withdraw%' THEN t.amount ELSE 0 END), 0)::numeric AS total_withdrawn,
           COALESCE(SUM(CASE WHEN LOWER(t.type::text) LIKE '%interest%' THEN t.amount ELSE 0 END), 0)::numeric AS interest_earned
         FROM transactions t
         WHERE t.member_id = $1 AND t.institution_id = $2`,
        [member.id, member.institution_id]
      )

      const agg = aggRes.rows[0] || {}
      const txAgg = txAggRes.rows[0] || {}

      return {
        accounts: accRes.rows.map((acc: any) => ({
          ...acc,
          client_name: member.full_name,
          client_number: member.member_number,
          available_balance: Number(acc.available_balance || 0),
          total_balance: Number(acc.total_balance || 0),
        })),
        total: accRes.rowCount || 0,
        summaryStats: {
          totalAvailable: Number(agg.total_available || 0),
          totalSavings: Number(agg.total_savings || 0),
          averageBalance: Number(agg.avg_balance || 0),
          activeAccounts: Number(agg.active_count || 0),
          totalAccounts: Number(agg.total_count || 0),
          lifetimeDeposited: Number(txAgg.lifetime_deposited || 0),
          totalWithdrawn: Number(txAgg.total_withdrawn || 0),
          interestEarned: Number(txAgg.interest_earned || 0),
        },
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
