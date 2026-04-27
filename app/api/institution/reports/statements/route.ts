import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

type ActorContext = {
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
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
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const url = new URL(req.url)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "500", 10), 1), 5000)
    const memberId = (url.searchParams.get("member_id") || "").trim()
    const clientId = (url.searchParams.get("client_id") || "").trim()
    const memberIdsRaw = (url.searchParams.get("member_ids") || "").trim()
    const clientIdsRaw = (url.searchParams.get("client_ids") || "").trim()
    const memberIds = memberIdsRaw ? memberIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const clientIds = clientIdsRaw ? clientIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const assignedTo = (url.searchParams.get("assigned_to") || "members").trim().toLowerCase()
    const statementType = (url.searchParams.get("statement_type") || "full").trim().toLowerCase()
    const dateStart = (url.searchParams.get("dateStart") || "").trim()
    const dateEnd = (url.searchParams.get("dateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_transactions")
      if (!allowed) return { error: "missing_permission:view_transactions" as const }

      const role = String(actor.role || "").trim().toLowerCase()
      if (role !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "t.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (role !== "super_admin") {
        where += ` AND t.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        where += ` AND t.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }
      // Apply assignee mode first so all downstream filters are scoped correctly.
      if (assignedTo === "clients") {
        where += ` AND (t.client_id IS NOT NULL OR COALESCE(c.name, '') <> '')`
      } else {
        where += ` AND t.member_id IS NOT NULL AND t.client_id IS NULL AND m.id IS NOT NULL`
      }
      if (memberId) {
        where += ` AND t.member_id = $${idx++}`
        params.push(memberId)
      } else if (memberIds.length > 0) {
        where += ` AND t.member_id = ANY($${idx++}::uuid[])`
        params.push(memberIds)
      }
      if (clientId) {
        where += ` AND t.client_id = $${idx++}`
        params.push(clientId)
      } else if (clientIds.length > 0) {
        where += ` AND t.client_id = ANY($${idx++}::uuid[])`
        params.push(clientIds)
      }
      if (dateStart) {
        where += ` AND t.transaction_date >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(dateStart)
      }
      if (dateEnd) {
        where += ` AND t.transaction_date <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date + INTERVAL '1 day' - INTERVAL '1 second')`
        params.push(dateEnd)
      }

      if (statementType === "sacco_loans") {
        where += ` AND (t.sacco_loan_id IS NOT NULL OR t.loan_id IS NOT NULL)`
      } else if (statementType === "investment") {
        where += ` AND (t.type ILIKE '%investment%' OR t.description ILIKE '%investment%')`
      } else if (statementType === "savings") {
        where += ` AND t.account_id IS NOT NULL`
      } else if (statementType === "loans") {
        where += ` AND t.loan_id IS NOT NULL`
      } else if (statementType === "shares") {
        where += ` AND t.type = 'Shares Purchase'`
      } else if (statementType === "membership_fee") {
        where += ` AND (t.type = 'Fee Payment' AND t.description ILIKE '%membership%')`
      }

      params.push(pageSize)
      const rowsRes = await client.query(
        `SELECT
           t.id,
           t.transaction_number,
           t.type,
           t.amount,
           t.mode,
           t.description,
           t.reference_number,
           t.balance_before,
           t.balance_after,
           t.transaction_date,
           t.member_id,
           t.client_id,
           t.account_id,
           t.loan_id,
           t.sacco_loan_id,
           m.full_name AS member_name,
           m.member_number,
           c.name AS client_name,
           c.phone AS client_number,
           sa.account_number
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         LEFT JOIN senteloans_clients c ON c.id = t.client_id
         LEFT JOIN senteloans_savings_accounts sa ON sa.id = t.account_id
         WHERE ${where}
         ORDER BY t.transaction_date DESC
         LIMIT $${idx}`,
        params
      )

      const debitTypes = new Set(["Withdrawal", "Loan Repayment", "Fee Payment"])
      const items = rowsRes.rows.map((r: Record<string, unknown>) => {
        const amount = Number(r.amount || 0)
        const txType = String(r.type || "")
        const debit = debitTypes.has(txType) ? amount : 0
        const credit = debit > 0 ? 0 : amount
        return {
          id: String(r.id || ""),
          transaction_number: String(r.transaction_number || ""),
          type: txType,
          amount,
          debit,
          credit,
          mode: String(r.mode || ""),
          description: String(r.description || ""),
          reference_number: String(r.reference_number || ""),
          balance_before: Number(r.balance_before || 0),
          balance_after: Number(r.balance_after || 0),
          transaction_date: r.transaction_date,
          member_id: String(r.member_id || ""),
          client_id: String(r.client_id || ""),
          member_name: String(r.member_name || ""),
          member_number: String(r.member_number || ""),
          client_name: String(r.client_name || ""),
          client_number: String(r.client_number || ""),
          account_number: String(r.account_number || ""),
        }
      })

      const totalCredit = items.reduce((s, i) => s + Number(i.credit || 0), 0)
      const totalDebit = items.reduce((s, i) => s + Number(i.debit || 0), 0)
      const openingBalance = items.length > 0 ? Number(items[items.length - 1].balance_before || 0) : 0
      const closingBalance = items.length > 0 ? Number(items[0].balance_after || 0) : 0

      return {
        total: items.length,
        items,
        summary: {
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          total_debit: totalDebit,
          total_credit: totalCredit,
        },
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode = code.startsWith("missing_permission:") ? 403 : code === "no_app_user_profile" ? 403 : 400
      return NextResponse.json({ error: code }, { status: statusCode })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
