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

function whereScope(actor: ActorContext) {
  const actorRole = String(actor.role || "").trim().toLowerCase()
  if (actorRole === "super_admin") {
    return { clause: "sa.id = $1 AND sa.institution_id = $2", params: [] as unknown[] }
  }
  return { clause: "sa.id = $1 AND sa.institution_id = $2 AND sa.branch_id = $3", params: [actor.branch_id] as unknown[] }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_account")
      if (!allowed) return { error: "missing_permission:view_account" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const accRes = await client.query(
        `SELECT
           sa.id,
           sa.member_id,
           sa.institution_id,
           sa.account_number,
           sa.account_type,
           sa.available_balance,
           sa.total_balance,
           sa.status,
           sa.open_date,
           sa.last_transaction_date
         FROM senteloans_savings_accounts sa
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params]
      )
      const acc = accRes.rows[0]
      if (!acc) return { error: "account_not_found" as const }

      let clientName = ""
      let clientNumber = ""
      if (acc.member_id) {
        const cRes = await client.query(`SELECT id, full_name, member_number FROM senteloans_members WHERE id = $1`, [acc.member_id])
        clientName = cRes.rows[0]?.full_name || ""
        clientNumber = cRes.rows[0]?.member_number || ""
      }

      const txRes = await client.query(
        `SELECT id, type, amount, mode, description, balance_after, transaction_date
         FROM senteloans_transactions
         WHERE account_id = $1
         ORDER BY transaction_date DESC
         LIMIT 25`,
        [acc.id]
      )

      return {
        account: {
          id: acc.id,
          member_id: acc.member_id,
          institution_id: acc.institution_id,
          account_number: acc.account_number,
          account_type: acc.account_type,
          available_balance: acc.available_balance,
          total_balance: acc.total_balance,
          status: acc.status,
          open_date: acc.open_date,
          last_transaction_date: acc.last_transaction_date,
          client_name: clientName,
          client_number: clientNumber,
        },
        transactions: txRes.rows.map((t: Record<string, unknown>) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          mode: t.mode,
          description: t.description,
          balance: t.balance_after,
          date: t.transaction_date,
        })),
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "account_not_found" ? 404 :
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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })

    const body = (await req.json()) as { status?: string }
    const status = body.status
    const updates: Record<string, unknown> = {}
    if (typeof status !== "undefined") {
      const allowed = ["Active", "Inactive", "Suspended", "Closed"]
      if (!allowed.includes(String(status))) return NextResponse.json({ error: "invalid_status" }, { status: 400 })
      updates.status = status
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "no_changes" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_account")
      if (!allowed) return { error: "missing_permission:view_account" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const curRes = await client.query(
        `SELECT sa.id, sa.status
         FROM senteloans_savings_accounts sa
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params]
      )
      const current = curRes.rows[0]
      if (!current) return { error: "account_not_found" as const }
      if (current.status === "Closed" && status === "Active") {
        return { error: "invalid_transition_closed_to_active" as const }
      }
      await client.query(`UPDATE senteloans_savings_accounts SET status = $1 WHERE id = $2`, [status, id])
      const accRes = await client.query(
        `SELECT id, member_id, institution_id, account_number, account_type, available_balance, total_balance, status, open_date, last_transaction_date
         FROM senteloans_savings_accounts
         WHERE id = $1`,
        [id]
      )
      return { ok: true, account: accRes.rows[0] }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "account_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 : 400
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
