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
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const type = (url.searchParams.get("type") || "").trim()
    const mode = (url.searchParams.get("mode") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const clientId = (url.searchParams.get("client_id") || "").trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      let where = "institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
      const params: unknown[] = [session!.user!.authUserId]
      let idx = 2
      if (clientId) {
        where += ` AND client_id = $${idx++}`
        params.push(clientId)
      }
      if (type) {
        where += ` AND type = $${idx++}`
        params.push(type)
      }
      if (mode) {
        where += ` AND mode = $${idx++}`
        params.push(mode)
      }
      if (dateFrom) {
        where += ` AND transaction_date >= $${idx++}`
        params.push(dateFrom)
      }
      if (dateTo) {
        where += ` AND transaction_date <= $${idx++}`
        params.push(dateTo)
      }
      if (search) {
        where += ` AND (description ILIKE $${idx} OR transaction_number ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_transactions WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const from = (page - 1) * pageSize
      params.push(pageSize, from)
      const dataRes = await client.query(
        `SELECT id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_after, transaction_date
         FROM senteloans_transactions WHERE ${where} ORDER BY transaction_date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      const data = dataRes.rows

      const clientIds = [...new Set(data.map((r: { client_id: string }) => r.client_id).filter(Boolean))]
      let clientMap: Record<string, string> = {}
      if (clientIds.length > 0) {
        const cRes = await client.query(`SELECT id, full_name FROM senteloans_clients WHERE id = ANY($1::uuid[])`, [clientIds])
        clientMap = Object.fromEntries(cRes.rows.map((c: { id: string; full_name: string }) => [c.id, c.full_name]))
      }

      const accountIds = [...new Set(data.map((r: { account_id: string }) => r.account_id).filter(Boolean))]
      let accountMap: Record<string, string> = {}
      if (accountIds.length > 0) {
        const aRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`, [accountIds])
        accountMap = Object.fromEntries(aRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        transaction_number: row.transaction_number,
        memberName: clientMap[row.client_id as string] || "",
        description: row.description || "",
        amount: row.amount,
        mode: row.mode,
        date: row.transaction_date,
        type: row.type,
        balance: row.balance_after,
        accountNumber: accountMap[row.account_id as string] || "",
      }))

      const baseWhere = "institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
      const recentRes = await client.query(
        `SELECT id, transaction_number, type, amount, mode, balance_after, transaction_date, account_id, client_id, description FROM senteloans_transactions WHERE ${baseWhere} ORDER BY transaction_date DESC LIMIT 10`,
        [session!.user!.authUserId]
      )
      const recentTx = recentRes.rows
      const recentClientIds = [...new Set(recentTx.map((t: { client_id: string }) => t.client_id).filter(Boolean))]
      const recentAccountIds = [...new Set(recentTx.map((t: { account_id: string }) => t.account_id).filter(Boolean))]
      let recentClientMap: Record<string, string> = {}
      let recentAccountMap: Record<string, string> = {}
      if (recentClientIds.length > 0) {
        const rcRes = await client.query(`SELECT id, full_name FROM senteloans_clients WHERE id = ANY($1::uuid[])`, [recentClientIds])
        recentClientMap = Object.fromEntries(rcRes.rows.map((c: { id: string; full_name: string }) => [c.id, c.full_name]))
      }
      if (recentAccountIds.length > 0) {
        const raRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`, [recentAccountIds])
        recentAccountMap = Object.fromEntries(raRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }
      const recent = recentTx.map((t: Record<string, unknown>) => ({
        id: t.id,
        transaction_number: t.transaction_number,
        type: t.type,
        amount: t.amount,
        mode: t.mode,
        balance: t.balance_after,
        date: t.transaction_date,
        description: t.description || "",
        memberName: recentClientMap[t.client_id as string] || "",
        accountNumber: recentAccountMap[t.account_id as string] || "",
      }))

      return { items, total, page, pageSize, recentTransactions: recent }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const client_id = String(body.client_id || "").trim()
    const account_id = String(body.account_id || "").trim()
    const type = body.type as string
    const amount = Number(body.amount)
    const mode = body.mode as string
    const description = typeof body.description === "string" ? body.description : ""
    const reference_number = typeof body.reference_number === "string" ? body.reference_number : ""
    const transaction_date = body.transaction_date as string | undefined

    if (!client_id) return NextResponse.json({ error: "client_id_required" }, { status: 400 })
    if (!account_id) return NextResponse.json({ error: "account_id_required" }, { status: 400 })
    if (!type || !["Deposit", "Withdrawal"].includes(String(type))) return NextResponse.json({ error: "invalid_type" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) return NextResponse.json({ error: "invalid_mode" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(`SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`, [session!.user!.authUserId])
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

      const [clientRes, accountRes] = await Promise.all([
        client.query(`SELECT id, institution_id, status FROM senteloans_clients WHERE id = $1`, [client_id]),
        client.query(`SELECT id, institution_id, status, available_balance, total_balance FROM senteloans_savings_accounts WHERE id = $1`, [account_id]),
      ])
      const clientRow = clientRes.rows[0]
      const account = accountRes.rows[0]
      if (!clientRow) return { error: "client_not_found" as const }
      if (!account) return { error: "account_not_found" as const }
      if (clientRow.institution_id !== actor.institution_id || account.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_operation_forbidden" as const }
      }
      if (String(account.status) !== "Active") return { error: "account_not_active" as const }

      const balance_before = Number(account.available_balance || 0)
      let balance_after = balance_before
      if (type === "Deposit") balance_after = balance_before + amount
      else if (type === "Withdrawal") {
        if (amount > balance_before) return { error: "insufficient_funds" as const }
        balance_after = balance_before - amount
      }

      const transaction_number = `TXN-${Date.now()}`
      const txDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString()

      await client.query(
        `UPDATE senteloans_savings_accounts SET available_balance = $1, total_balance = $2, last_transaction_date = $3 WHERE id = $4`,
        [balance_after, balance_after, txDate.slice(0, 10), account_id]
      )

      const insRes = await client.query(
        `INSERT INTO senteloans_transactions (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Completed') RETURNING id`,
        [actor.institution_id, client_id, account_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, actor.id, txDate]
      )
      const txRow = insRes.rows[0]
      if (!txRow) return { error: "insert_failed" as const }

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values) VALUES ($1, $2, 'senteloans_transactions', 'INSERT', $3, $4)`,
        [actor.institution_id, actor.id, txRow.id, JSON.stringify({ transaction_number, type, amount, client_id, account_id })]
      )

      return { ok: true, id: txRow.id, transaction_number, balance_after }
    })

    if (result && "error" in result) {
      const status = result.error === "cross_tenant_operation_forbidden" ? 403 : result.error === "client_not_found" || result.error === "account_not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
