import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"

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
  const apiPath = getApiPath(_req)
  try {
    const { id } = await params
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
    const dateStart = String(url.searchParams.get("dateStart") || "").trim()
    const dateEnd = String(url.searchParams.get("dateEnd") || "").trim()
    if (!id) {
      apiLog("warn", "savings.detail.invalid", { method: "GET", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "savings.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "savings.detail.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const canView = await hasPermission(client, actor, "view_account")
      if (!canView) return { error: "missing_permission:view_account" as const }

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

      const txWhere: string[] = ["account_id = $1"]
      const txParams: unknown[] = [acc.id]
      let txArg = 2

      if (type) {
        txWhere.push(`type::text = $${txArg++}`)
        txParams.push(type)
      }
      if (modes.length > 0) {
        txWhere.push(`mode::text = ANY($${txArg++}::text[])`)
        txParams.push(modes)
      }
      if (dateStart) {
        txWhere.push(`transaction_date::date >= $${txArg++}::date`)
        txParams.push(dateStart)
      }
      if (dateEnd) {
        txWhere.push(`transaction_date::date <= $${txArg++}::date`)
        txParams.push(dateEnd)
      }

      const txWhereClause = txWhere.join(" AND ")

      const txCountRes = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM senteloans_transactions
         WHERE ${txWhereClause}`,
        txParams
      )
      const txTotal = Number(txCountRes.rows[0]?.total || 0)

      const txRes = await client.query(
        `SELECT id, type, amount, mode, description, balance_after, transaction_date
         FROM senteloans_transactions
         WHERE ${txWhereClause}
         ORDER BY transaction_date DESC
         LIMIT $${txArg++}
         OFFSET $${txArg++}`,
        [...txParams, pageSize, offset]
      )

      const txFilterRes = await client.query(
        `SELECT
           ARRAY(
             SELECT DISTINCT t.type
             FROM senteloans_transactions t
             WHERE t.account_id = $1 AND t.type IS NOT NULL AND btrim(t.type::text) <> ''
             ORDER BY t.type
           ) AS types,
           ARRAY(
             SELECT DISTINCT t.mode
             FROM senteloans_transactions t
             WHERE t.account_id = $1 AND t.mode IS NOT NULL AND btrim(t.mode::text) <> ''
             ORDER BY t.mode
           ) AS modes`,
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
        transactionPagination: {
          total: txTotal,
          page,
          pageSize,
        },
        transactionFilters: {
          types: Array.isArray(txFilterRes.rows[0]?.types) ? txFilterRes.rows[0].types : [],
          modes: Array.isArray(txFilterRes.rows[0]?.modes) ? txFilterRes.rows[0].modes : [],
        },
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "account_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "savings.detail.denied", { method: "GET", apiPath, status: statusCode, error: errorCode, accountId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "savings.detail.success", { method: "GET", apiPath, status: 200, accountId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "savings.update.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized", accountId: id })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "savings.update.denied", { method: "PUT", apiPath, status: 403, error: "no_app_user_profile", accountId: id })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = (await req.json()) as { status?: string; account_type?: string }
    const status = body.status
    const accountType = body.account_type
    const updates: Record<string, unknown> = {}
    if (typeof status !== "undefined") {
      const allowed = ["Active", "Inactive", "Suspended", "Closed"]
      if (!allowed.includes(String(status))) {
        apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "invalid_status", accountId: id })
        return NextResponse.json({ error: "invalid_status" }, { status: 400 })
      }
      updates.status = status
    }
    if (typeof accountType !== "undefined") {
      const allowedAccountTypes = ["Voluntary", "Fixed", "Shares", "Current"]
      if (!allowedAccountTypes.includes(String(accountType))) {
        apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "invalid_account_type", accountId: id })
        return NextResponse.json({ error: "invalid_account_type" }, { status: 400 })
      }
      updates.account_type = accountType
    }
    if (Object.keys(updates).length === 0) {
      apiLog("warn", "savings.update.invalid", { method: "PUT", apiPath, status: 400, error: "no_changes", accountId: id })
      return NextResponse.json({ error: "no_changes" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const canView = await hasPermission(client, actor, "view_account")
      if (!canView) return { error: "missing_permission:view_account" as const }
      const canMutate = await hasPermission(client, actor, "edit_account")
      if (!canMutate) return { error: "missing_permission:edit_account" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const curRes = await client.query(
        `SELECT sa.id, sa.status, sa.account_type
         FROM senteloans_savings_accounts sa
         WHERE ${scope.clause}`,
        [id, actor.institution_id, ...scope.params]
      )
      const current = curRes.rows[0]
      if (!current) return { error: "account_not_found" as const }
      if (current.status === "Closed" && status === "Active") {
        return { error: "invalid_transition_closed_to_active" as const }
      }
      await client.query(
        `UPDATE senteloans_savings_accounts
         SET status = COALESCE($1, status),
             account_type = COALESCE($2, account_type)
         WHERE id = $3`,
        [typeof status === "undefined" ? null : status, typeof accountType === "undefined" ? null : accountType, id]
      )
      await auditLogger.logUpdate(
        "senteloans_savings_accounts",
        id,
        {
          status: current.status,
          account_type: current.account_type,
        },
        {
          status: status || current.status,
          account_type: accountType || current.account_type,
        },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )
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
      apiLog("warn", "savings.update.denied", { method: "PUT", apiPath, status: statusCode, error: errorCode, accountId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "savings.update.success", { method: "PUT", apiPath, status: 200, accountId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "savings.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
