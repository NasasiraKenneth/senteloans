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
    let pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const status = (url.searchParams.get("status") || "").trim()
    const accountType = (url.searchParams.get("account_type") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const memberId = (url.searchParams.get("member_id") || url.searchParams.get("client_id") || "").trim()
    const openDateStart = (url.searchParams.get("open_dateStart") || "").trim()
    const openDateEnd = (url.searchParams.get("open_dateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const limit = url.searchParams.get("limit") || ""
    if (limit) {
      const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200)
      pageSize = n
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_savings")
      if (!allowed) return { error: "missing_permission:view_savings" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "sa.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (actorRole !== "super_admin") {
        where += ` AND sa.branch_id = $${idx}`
        params.push(actor.branch_id)
        idx++
      } else if (selectedBranchIds.length > 0) {
        where += ` AND sa.branch_id = ANY($${idx}::uuid[])`
        params.push(selectedBranchIds)
        idx++
      }

      if (status) {
        where += ` AND sa.status = $${idx++}`
        params.push(status)
      }
      if (accountType) {
        where += ` AND sa.account_type = $${idx++}`
        params.push(accountType)
      }
      if (memberId) {
        where += ` AND sa.member_id = $${idx++}`
        params.push(memberId)
      }
      if (search) {
        where += ` AND (sa.account_number ILIKE $${idx} OR m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (openDateStart) {
        where += ` AND sa.open_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateStart)
        idx++
      }
      if (openDateEnd) {
        where += ` AND sa.open_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateEnd)
        idx++
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM senteloans_savings_accounts sa
         LEFT JOIN senteloans_members m ON m.id = sa.member_id
         WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const from = (page - 1) * pageSize
      params.push(pageSize, from)
      const dataRes = await client.query(
        `SELECT
           sa.id,
           sa.member_id,
           sa.account_number,
           sa.account_type,
           sa.available_balance,
           sa.total_balance,
           sa.status,
           sa.open_date,
           sa.last_transaction_date,
           m.full_name AS member_name
         FROM senteloans_savings_accounts sa
         LEFT JOIN senteloans_members m ON m.id = sa.member_id
         WHERE ${where}
         ORDER BY sa.open_date DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      const data = dataRes.rows

      const accountIds = data.map((r: { id: string }) => r.id)
      let recentTx: Array<Record<string, unknown>> = []
      if (accountIds.length > 0) {
        const txRes = await client.query(
          `SELECT id, type, amount, mode, balance_after, transaction_date, account_id, member_id
           FROM senteloans_transactions
           WHERE account_id = ANY($1::uuid[])
           ORDER BY transaction_date DESC
           LIMIT 5`,
          [accountIds]
        )
        recentTx = txRes.rows
      }

      const memberIdsFromTx = [...new Set(recentTx.map((t: Record<string, unknown>) => t.member_id).filter(Boolean))]
      let memberMap: Record<string, string> = {}
      if (memberIdsFromTx.length > 0) {
        const mRes = await client.query(`SELECT id, full_name FROM senteloans_members WHERE id = ANY($1::uuid[])`, [memberIdsFromTx])
        memberMap = Object.fromEntries(mRes.rows.map((m: { id: string; full_name: string }) => [m.id, m.full_name]))
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
        client_name: row.member_name || "",
      }))

      const recent = recentTx.map((t: Record<string, unknown>) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        mode: t.mode,
        balance: t.balance_after,
        date: t.transaction_date,
        memberName: memberMap[t.member_id as string] || "",
        accountNumber: accountMap[t.account_id as string] || "",
      }))

      return { items, total, recentTransactions: recent, page, pageSize }
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
