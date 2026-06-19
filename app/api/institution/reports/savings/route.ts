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
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
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
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
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
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "200", 10), 1), 5000)
    const status = (url.searchParams.get("status") || "").trim()
    const accountType = (url.searchParams.get("account_type") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const openDateStart = (url.searchParams.get("openDateStart") || "").trim()
    const openDateEnd = (url.searchParams.get("openDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_savings")
      if (!allowed) return { error: "missing_permission:view_savings" as const }

      const role = String(actor.role || "").trim().toLowerCase()
      if (role !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "sa.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (role !== "super_admin") {
        where += ` AND sa.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        where += ` AND sa.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }

      if (status && status !== "all") {
        where += ` AND sa.status = $${idx++}`
        params.push(status)
      }
      if (accountType && accountType !== "all") {
        where += ` AND sa.account_type = $${idx++}`
        params.push(accountType)
      }
      if (search) {
        where += ` AND (sa.account_number ILIKE $${idx} OR m.full_name ILIKE $${idx} OR m.member_number ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (openDateStart) {
        where += ` AND sa.open_date >= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateStart)
      }
      if (openDateEnd) {
        where += ` AND sa.open_date <= (($${idx++}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
        params.push(openDateEnd)
      }

      const summaryRes = await client.query(
        `SELECT
           COUNT(*)::int AS total_accounts,
           COUNT(*) FILTER (WHERE sa.status = 'Active')::int AS active_accounts,
           COUNT(*) FILTER (WHERE sa.status = 'Inactive')::int AS inactive_accounts,
           COUNT(*) FILTER (WHERE sa.status = 'Suspended')::int AS suspended_accounts,
           COUNT(*) FILTER (WHERE sa.status = 'Closed')::int AS closed_accounts,
           COALESCE(SUM(sa.total_balance), 0)::numeric AS total_balance,
           COALESCE(SUM(sa.available_balance), 0)::numeric AS total_available_balance
         FROM savings_accounts sa
         LEFT JOIN members m ON m.id = sa.member_id
         WHERE ${where}`,
        params
      )

      params.push(pageSize)
      const rowsRes = await client.query(
        `SELECT
           sa.id,
           sa.account_number,
           sa.account_type,
           sa.available_balance,
           sa.total_balance,
           sa.status,
           sa.open_date,
           sa.last_transaction_date,
           m.full_name AS member_name,
           m.member_number AS member_number,
           b.name AS branch_name
         FROM savings_accounts sa
         LEFT JOIN members m ON m.id = sa.member_id
         LEFT JOIN branches b ON b.id = sa.branch_id
         WHERE ${where}
         ORDER BY sa.open_date DESC
         LIMIT $${idx}`,
        params
      )

      const items = rowsRes.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id || ""),
        account_number: String(r.account_number || ""),
        account_type: String(r.account_type || ""),
        available_balance: Number(r.available_balance || 0),
        total_balance: Number(r.total_balance || 0),
        status: String(r.status || ""),
        open_date: r.open_date,
        last_transaction_date: r.last_transaction_date,
        member_name: String(r.member_name || ""),
        member_number: String(r.member_number || ""),
        branch_name: String(r.branch_name || ""),
      }))

      const summary = summaryRes.rows[0] as Record<string, unknown>
      const total = Number(summary?.total_accounts || 0)
      const totalBalance = Number(summary?.total_balance || 0)
      const totalAvailableBalance = Number(summary?.total_available_balance || 0)
      const activeAccounts = Number(summary?.active_accounts || 0)
      const inactiveAccounts = Number(summary?.inactive_accounts || 0)
      const suspendedAccounts = Number(summary?.suspended_accounts || 0)
      const closedAccounts = Number(summary?.closed_accounts || 0)

      return {
        total,
        items,
        summary: {
          total_accounts: total,
          active_accounts: activeAccounts,
          inactive_accounts: inactiveAccounts,
          suspended_accounts: suspendedAccounts,
          closed_accounts: closedAccounts,
          total_balance: totalBalance,
          total_available_balance: totalAvailableBalance,
          average_balance: total > 0 ? totalBalance / total : 0,
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
