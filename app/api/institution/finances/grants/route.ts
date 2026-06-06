import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext, scopeWhere } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { auditGrantInsert, grantSnapshot } from "@/lib/audit/finances-audit"
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
    const search = (url.searchParams.get("q") || "").trim()
    const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    const readIsoDate = (key: string) => {
      const raw = (url.searchParams.get(key) || "").trim()
      return isIsoDate(raw) ? raw : ""
    }
    const createdFrom = readIsoDate("created_from")
    const createdTo = readIsoDate("created_to")
    const updatedFrom = readIsoDate("updated_from")
    const updatedTo = readIsoDate("updated_to")
    const pageRaw = parseInt(url.searchParams.get("page") || "0", 10)
    const rowsPerPageRaw = parseInt(url.searchParams.get("rowsPerPage") || "10", 10)
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0
    const rowsPerPage = Math.min(Math.max(Number.isFinite(rowsPerPageRaw) ? rowsPerPageRaw : 10, 1), 200)
    const offset = page * rowsPerPage

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants)
      if (!allowed) return { error: "missing_permission:view_grants" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const scoped = scopeWhere({ tableAlias: "g", actor, selectedBranchIds })
      let where = scoped.where
      const values: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex

      if (search) {
        where += ` AND c.name ILIKE $${idx}`
        values.push(`%${search}%`)
        idx++
      }

      if (createdFrom) {
        where += ` AND g.created_at >= $${idx}::date`
        values.push(createdFrom)
        idx++
      }
      if (createdTo) {
        where += ` AND g.created_at < ($${idx}::date + INTERVAL '1 day')`
        values.push(createdTo)
        idx++
      }
      if (updatedFrom) {
        where += ` AND g.updated_at >= $${idx}::date`
        values.push(updatedFrom)
        idx++
      }
      if (updatedTo) {
        where += ` AND g.updated_at < ($${idx}::date + INTERVAL '1 day')`
        values.push(updatedTo)
        idx++
      }

      const limitIdx = idx
      const offsetIdx = idx + 1
      values.push(rowsPerPage, offset)

      const listRes = await client.query(
        `SELECT
           g.id,
           c.name AS client_name,
           COALESCE(g.total_amount, 0)::numeric AS total_amount,
           COALESCE(g.available_balance, 0)::numeric AS available_balance,
           GREATEST(COALESCE(g.total_amount, 0) - COALESCE(g.available_balance, 0), 0)::numeric AS remaining_amount,
           CASE
             WHEN COALESCE(g.total_amount, 0) > 0
               THEN ROUND((COALESCE(g.available_balance, 0) / g.total_amount) * 100, 2)
             ELSE 0
           END::numeric AS percentage_received,
           b.name AS branch_name,
           g.created_at,
           g.updated_at,
           COUNT(*) OVER()::int AS total_count
         FROM grants g
         JOIN clients c ON c.id = g.client_id
         LEFT JOIN branches b ON b.id = g.branch_id
         WHERE ${where}
         ORDER BY g.updated_at DESC NULLS LAST, g.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values,
      )

      const total = listRes.rows[0]?.total_count != null ? Number(listRes.rows[0].total_count) : 0

      return {
        rows: listRes.rows.map((row) => ({
          id: String(row.id),
          client_name: String(row.client_name || ""),
          total_amount: Number(row.total_amount || 0),
          available_balance: Number(row.available_balance || 0),
          remaining_amount: Number(row.remaining_amount || 0),
          percentage_received: Number(row.percentage_received || 0),
          branch_name: String(row.branch_name || ""),
          created_at: row.created_at ? String(row.created_at) : "",
          updated_at: row.updated_at ? String(row.updated_at) : "",
        })),
        total,
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    return NextResponse.json({ rows: result?.rows || [], total: result?.total || 0 })
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
        `SELECT 1 FROM clients
         WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
         LIMIT 1`,
        [clientId, actor.institution_id, targetBranchId],
      )
      if ((clientCheck.rowCount ?? 0) === 0) return { error: "invalid_client" as const }

      const insertRes = await client.query(
        `INSERT INTO grants (institution_id, branch_id, client_id, total_amount, available_balance)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
         RETURNING id, client_id, total_amount, available_balance, branch_id`,
        [actor.institution_id, targetBranchId, clientId, totalAmount, availableBalance],
      )

      const newRow = insertRes.rows[0] as Record<string, unknown> | undefined
      const newId = String(newRow?.id || "")
      if (newRow && newId) {
        await auditGrantInsert(
          client,
          actor,
          newId,
          grantSnapshot(newRow),
          (newRow.branch_id as string | null | undefined) ?? targetBranchId,
        )
      }

      return { id: newId }
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
