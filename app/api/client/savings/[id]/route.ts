import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_account_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) {
      return NextResponse.json({ error: "client_only" }, { status: 403 })
    }

    const url = new URL(_req.url)
    const page = Math.max(1, Number(url.searchParams.get("page") || 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 10)))
    const offset = (page - 1) * pageSize
    const type = String(url.searchParams.get("type") || "").trim()
    const modeRaw = String(url.searchParams.get("mode") || "").trim()
    const modes = modeRaw
      ? modeRaw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : []
    const dateStart = String(
      url.searchParams.get("dateStart") ||
      url.searchParams.get("date_from") ||
      url.searchParams.get("startDate") ||
      ""
    ).trim()
    const dateEnd = String(
      url.searchParams.get("dateEnd") ||
      url.searchParams.get("date_to") ||
      url.searchParams.get("endDate") ||
      ""
    ).trim()
    const search = String(url.searchParams.get("search") || "").trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const member = clientRes.rows[0]
      if (!member) return null

      const accRes = await client.query(
        `SELECT 
           id, 
           account_number, 
           account_type, 
           available_balance, 
           total_balance, 
           status, 
           open_date, 
           last_transaction_date,
           member_id,
           institution_id
         FROM savings_accounts 
         WHERE id = $1 AND member_id = $2 AND institution_id = $3`,
        [id, member.id, member.institution_id]
      )
      const account = accRes.rows[0]
      if (!account) return null

      account.client_name = member.full_name
      account.client_number = member.member_number
      account.available_balance = Number(account.available_balance || 0)
      account.total_balance = Number(account.total_balance || 0)

      const txWhere: string[] = ["t.account_id = $1 AND t.member_id = $2 AND t.institution_id = $3"]
      const txParams: unknown[] = [account.id, member.id, member.institution_id]
      let txArg = 4

      if (type && type !== "all") {
        txWhere.push(`LOWER(TRIM(t.type::text)) = LOWER(TRIM($${txArg++}))`)
        txParams.push(type)
      }

      if (modes.length > 0) {
        txWhere.push(`LOWER(TRIM(t.mode::text)) = ANY($${txArg++})`)
        txParams.push(modes.map((m) => m.toLowerCase()))
      }

      if (search) {
        txWhere.push(`(t.transaction_number ILIKE $${txArg} OR t.description ILIKE $${txArg} OR t.type::text ILIKE $${txArg} OR t.mode::text ILIKE $${txArg})`)
        txParams.push(`%${search}%`)
        txArg++
      }

      if (dateStart) {
        txWhere.push(`t.transaction_date::date >= $${txArg++}::date`)
        txParams.push(dateStart)
      }

      if (dateEnd) {
        txWhere.push(`t.transaction_date::date <= $${txArg++}::date`)
        txParams.push(dateEnd)
      }

      const whereClause = txWhere.join(" AND ")

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM transactions t WHERE ${whereClause}`,
        txParams
      )
      const totalTx = countRes.rows[0]?.total || 0

      const txRes = await client.query(
        `SELECT 
           t.id, 
           t.transaction_number,
           t.type, 
           t.amount, 
           t.mode, 
           t.description, 
           t.balance_after, 
           t.transaction_date 
         FROM transactions t 
         WHERE ${whereClause} 
         ORDER BY t.transaction_date DESC, t.created_at DESC 
         LIMIT $${txArg++} OFFSET $${txArg++}`,
        [...txParams, pageSize, offset]
      )

      const transactions = txRes.rows.map((t: Record<string, unknown>) => ({
        id: t.id,
        transaction_number: t.transaction_number || t.id,
        type: String(t.type || ""),
        amount: Number(t.amount || 0),
        mode: String(t.mode || ""),
        balance: Number(t.balance_after || 0),
        balance_after: Number(t.balance_after || 0),
        date: t.transaction_date,
        transaction_date: t.transaction_date,
        description: (t.description as string) || "",
      }))

      // Summary for this account
      const summaryRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN t.type IN ('Deposit', 'Opening Balance', 'Shares Purchase') OR LOWER(t.type::text) LIKE '%deposit%' THEN t.amount ELSE 0 END), 0)::numeric AS deposits_total,
           COALESCE(SUM(CASE WHEN t.type = 'Withdrawal' OR LOWER(t.type::text) LIKE '%withdraw%' THEN t.amount ELSE 0 END), 0)::numeric AS withdrawals_total
         FROM transactions t
         WHERE t.account_id = $1 AND t.member_id = $2`,
        [account.id, member.id]
      )
      const summary = summaryRes.rows[0] || {}

      return {
        account,
        transactions,
        transactionPagination: {
          page: page - 1,
          pageSize,
          total: totalTx,
        },
        summary: {
          depositsTotal: Number(summary.deposits_total || 0),
          withdrawalsTotal: Number(summary.withdrawals_total || 0),
        },
      }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
