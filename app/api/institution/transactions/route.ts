import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const type = (url.searchParams.get("type") || "").trim()
    const mode = (url.searchParams.get("mode") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const memberId = (url.searchParams.get("member_id") || url.searchParams.get("client_id") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_transactions")
      if (!allowed) return { error: "missing_permission:view_transactions" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "t.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (actorRole !== "super_admin") {
        where += ` AND t.branch_id = $${idx}`
        params.push(actor.branch_id)
        idx++
      } else if (selectedBranchIds.length > 0) {
        where += ` AND t.branch_id = ANY($${idx}::uuid[])`
        params.push(selectedBranchIds)
        idx++
      }

      if (memberId) {
        where += ` AND t.member_id = $${idx++}`
        params.push(memberId)
      }
      if (type) {
        where += ` AND t.type = $${idx++}`
        params.push(type)
      }
      if (mode) {
        where += ` AND t.mode = $${idx++}`
        params.push(mode)
      }
      if (dateFrom) {
        where += ` AND t.transaction_date >= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
        params.push(dateFrom)
        idx++
      }
      if (dateTo) {
        where += ` AND t.transaction_date <= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
        params.push(dateTo)
        idx++
      }
      if (search) {
        where += ` AND (t.description ILIKE $${idx} OR t.transaction_number ILIKE $${idx} OR m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const from = (page - 1) * pageSize
      params.push(pageSize, from)
      const dataRes = await client.query(
        `SELECT
           t.id,
           t.member_id,
           t.account_id,
           t.loan_id,
           t.transaction_number,
           t.type,
           t.amount,
           t.mode,
           t.description,
           t.reference_number,
           t.balance_after,
           t.transaction_date,
           m.full_name AS member_name
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      const data = dataRes.rows

      const accountIds = [...new Set(data.map((r: { account_id: string }) => r.account_id).filter(Boolean))]
      let accountMap: Record<string, string> = {}
      if (accountIds.length > 0) {
        const aRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`, [accountIds])
        accountMap = Object.fromEntries(aRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        transaction_number: row.transaction_number,
        memberName: row.member_name || "",
        description: row.description || "",
        amount: row.amount,
        mode: row.mode,
        date: row.transaction_date,
        type: row.type,
        balance: row.balance_after,
        accountNumber: accountMap[row.account_id as string] || "",
      }))

      const recentWhereParts = ["t.institution_id = $1"] as string[]
      const recentParams: unknown[] = [actor.institution_id]
      let ridx = 2
      if (actorRole !== "super_admin") {
        recentWhereParts.push(`t.branch_id = $${ridx}`)
        recentParams.push(actor.branch_id)
        ridx++
      } else if (selectedBranchIds.length > 0) {
        recentWhereParts.push(`t.branch_id = ANY($${ridx}::uuid[])`)
        recentParams.push(selectedBranchIds)
        ridx++
      }

      const recentRes = await client.query(
        `SELECT t.id, t.transaction_number, t.type, t.amount, t.mode, t.balance_after, t.transaction_date, t.account_id, t.member_id, t.description, m.full_name AS member_name
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         WHERE ${recentWhereParts.join(" AND ")}
         ORDER BY t.created_at DESC
         LIMIT 10`,
        recentParams
      )
      const recentTx = recentRes.rows
      const recentAccountIds = [...new Set(recentTx.map((t: { account_id: string }) => t.account_id).filter(Boolean))]
      let recentAccountMap: Record<string, string> = {}
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
        memberName: t.member_name || "",
        accountNumber: recentAccountMap[t.account_id as string] || "",
      }))

      return { items, total, page, pageSize, recentTransactions: recent }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
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
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const member_id = String(body.member_id || body.client_id || "").trim()
    const account_id = String(body.account_id || "").trim()
    const type = body.type as string
    const amount = Number(body.amount)
    const mode = body.mode as string
    const description = typeof body.description === "string" ? body.description : ""
    const reference_number = typeof body.reference_number === "string" ? body.reference_number : ""
    const transaction_date = body.transaction_date as string | undefined

    if (!member_id) return NextResponse.json({ error: "member_id_required" }, { status: 400 })
    if (!account_id) return NextResponse.json({ error: "account_id_required" }, { status: 400 })
    if (!type || !["Deposit", "Withdrawal"].includes(String(type))) return NextResponse.json({ error: "invalid_type" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) return NextResponse.json({ error: "invalid_mode" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "create_transaction")
      if (!allowed) return { error: "missing_permission:create_transaction" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const [memberRes, accountRes] = await Promise.all([
        client.query(`SELECT id, institution_id, branch_id, status FROM senteloans_members WHERE id = $1`, [member_id]),
        client.query(`SELECT id, institution_id, branch_id, member_id, status, available_balance, total_balance FROM senteloans_savings_accounts WHERE id = $1`, [account_id]),
      ])
      const memberRow = memberRes.rows[0]
      const account = accountRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (!account) return { error: "account_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id || account.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_operation_forbidden" as const }
      }
      if (String(account.member_id) !== String(member_id)) return { error: "account_member_mismatch" as const }
      if (actorRole !== "super_admin" && (memberRow.branch_id !== actor.branch_id || account.branch_id !== actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
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
        `INSERT INTO senteloans_transactions (institution_id, branch_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Completed') RETURNING id`,
        [actor.institution_id, account.branch_id, member_id, account_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, actor.id, txDate]
      )
      const txRow = insRes.rows[0]
      if (!txRow) return { error: "insert_failed" as const }

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values) VALUES ($1, $2, 'senteloans_transactions', 'INSERT', $3, $4)`,
        [actor.institution_id, actor.id, txRow.id, JSON.stringify({ transaction_number, type, amount, member_id, account_id })]
      )

      return { ok: true, id: txRow.id, transaction_number, balance_after }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const status =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "cross_tenant_operation_forbidden" || errorCode === "cross_branch_operation_forbidden" ? 403 :
        errorCode === "member_not_found" || errorCode === "account_not_found" ? 404 : 400
      return NextResponse.json({ error: errorCode }, { status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
