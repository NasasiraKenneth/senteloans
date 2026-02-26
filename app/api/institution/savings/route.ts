import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    let pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const status = (url.searchParams.get("status") || "").trim()
    const accountType = (url.searchParams.get("account_type") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const clientId = (url.searchParams.get("client_id") || "").trim()
    const openDateStart = (url.searchParams.get("open_dateStart") || "").trim()
    const openDateEnd = (url.searchParams.get("open_dateEnd") || "").trim()
    const limit = url.searchParams.get("limit") || ""
    if (limit) {
      const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200)
      pageSize = n
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      let where = "institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
      const params: unknown[] = [session!.user!.authUserId]
      let idx = 2
      if (status) {
        where += ` AND status = $${idx++}`
        params.push(status)
      }
      if (accountType) {
        where += ` AND account_type = $${idx++}`
        params.push(accountType)
      }
      if (clientId) {
        where += ` AND client_id = $${idx++}`
        params.push(clientId)
      }
      if (search) {
        where += ` AND account_number ILIKE $${idx++}`
        params.push(`%${search}%`)
      }
      if (openDateStart) {
        where += ` AND open_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateStart)
        idx++
      }
      if (openDateEnd) {
        where += ` AND open_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateEnd)
        idx++
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_savings_accounts WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const from = (page - 1) * pageSize
      params.push(pageSize, from)
      const dataRes = await client.query(
        `SELECT id, client_id, account_number, account_type, available_balance, total_balance, status, open_date, last_transaction_date
         FROM senteloans_savings_accounts WHERE ${where} ORDER BY open_date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      const data = dataRes.rows

      const clientIds = [...new Set(data.map((r: { client_id: string }) => r.client_id).filter(Boolean))]
      let clientMap: Record<string, string> = {}
      if (clientIds.length > 0) {
        const cRes = await client.query(`SELECT id, full_name FROM senteloans_clients WHERE id = ANY($1::uuid[])`, [clientIds])
        clientMap = Object.fromEntries(cRes.rows.map((c: { id: string; full_name: string }) => [c.id, c.full_name]))
      }

      const accountIds = data.map((r: { id: string }) => r.id)
      let recentTx: Array<Record<string, unknown>> = []
      if (accountIds.length > 0) {
        const txRes = await client.query(
          `SELECT id, type, amount, mode, balance_after, transaction_date, account_id, client_id FROM senteloans_transactions WHERE account_id = ANY($1::uuid[]) ORDER BY transaction_date DESC LIMIT 5`,
          [accountIds]
        )
        recentTx = txRes.rows
      }

      const accountIdsFromTx = [...new Set(recentTx.map((t: Record<string, unknown>) => t.account_id).filter(Boolean))]
      let accountMap: Record<string, string> = {}
      if (accountIdsFromTx.length > 0) {
        const accRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`, [accountIdsFromTx])
        accountMap = Object.fromEntries(accRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        account_number: row.account_number,
        account_type: row.account_type,
        available_balance: row.available_balance,
        total_balance: row.total_balance,
        status: row.status,
        open_date: row.open_date,
        client_name: clientMap[row.client_id as string] || "",
      }))

      const recent = recentTx.map((t: Record<string, unknown>) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        mode: t.mode,
        balance: t.balance_after,
        date: t.transaction_date,
        memberName: clientMap[t.client_id as string] || "",
        accountNumber: accountMap[t.account_id as string] || "",
      }))

      return { items, total, recentTransactions: recent, page, pageSize }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
