import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10), 1), 500)

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants)
      if (!allowed) return { error: "missing_permission:view_grants" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const scoped = scopeWhere({ tableAlias: "g", actor, selectedBranchIds })
      const values = [...scoped.values, limit]

      const listRes = await client.query(
        `SELECT
           g.id,
           c.name AS client_name,
           COALESCE(g.total_amount, 0)::numeric AS total_amount,
           COALESCE(g.available_balance, 0)::numeric AS available_balance,
           b.name AS branch_name,
           g.updated_at
         FROM senteloans_grants g
         JOIN senteloans_clients c ON c.id = g.client_id
         LEFT JOIN senteloans_branches b ON b.id = g.branch_id
         WHERE ${scoped.where}
         ORDER BY g.updated_at DESC NULLS LAST, g.created_at DESC
         LIMIT $${scoped.nextIndex}`,
        values,
      )

      return {
        rows: listRes.rows.map((row) => ({
          id: String(row.id),
          client_name: String(row.client_name || ""),
          total_amount: Number(row.total_amount || 0),
          available_balance: Number(row.available_balance || 0),
          branch_name: String(row.branch_name || ""),
          updated_at: row.updated_at ? String(row.updated_at) : "",
        })),
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json({ rows: result?.rows || [] })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.list.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = await req.json().catch(() => ({}))
    const clientId = String(body?.client_id || "").trim()
    const totalAmount = Number(body?.total_amount)
    const availableBalanceRaw = body?.available_balance
    const branchId = String(body?.branch_id || "").trim()

    if (!clientId) {
      return NextResponse.json({ error: "client_id_required" }, { status: 400 })
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json({ error: "invalid_total_amount" }, { status: 400 })
    }

    const availableBalance =
      availableBalanceRaw === undefined || availableBalanceRaw === null || availableBalanceRaw === ""
        ? totalAmount
        : Number(availableBalanceRaw)

    if (!Number.isFinite(availableBalance) || availableBalance < 0 || availableBalance > totalAmount) {
      return NextResponse.json({ error: "invalid_available_balance" }, { status: 400 })
    }

    const created = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.addGrant)
      if (!allowed) return { error: "missing_permission:add_grant" as const }

      const targetBranchId = isSuperAdmin(actor) ? branchId || actor.branch_id : actor.branch_id
      if (!targetBranchId) return { error: "branch_id_required" as const }

      const clientCheck = await client.query(
        `SELECT 1 FROM senteloans_clients
         WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
         LIMIT 1`,
        [clientId, actor.institution_id, targetBranchId],
      )
      if ((clientCheck.rowCount ?? 0) === 0) return { error: "invalid_client" as const }

      const insertRes = await client.query(
        `INSERT INTO senteloans_grants (institution_id, branch_id, client_id, total_amount, available_balance)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
         RETURNING id`,
        [actor.institution_id, targetBranchId, clientId, totalAmount, availableBalance],
      )

      return { id: String(insertRes.rows[0]?.id || "") }
    })

    if (created && "error" in created) {
      const statusCode =
        created.error === "branch_id_required" || created.error === "invalid_client" ? 400 : 403
      return NextResponse.json({ error: created.error }, { status: statusCode })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.create.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
