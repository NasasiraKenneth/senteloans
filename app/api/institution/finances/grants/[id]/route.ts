import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"
import { runWithAuth } from "@/lib/db"
import { auditGrantUpdate, grantSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"

function singleGrantWhere(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>,
  grantId: string,
): { where: string; values: unknown[] } {
  let where = `g.id = $1::uuid AND g.institution_id = $2::uuid`
  const values: unknown[] = [grantId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND g.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: grantId } = await params
  if (!grantId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const canView = await hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants)
      const canEdit = await hasPermission(client, actor, FINANCE_PERMISSIONS.editGrant)
      if (!canView && !canEdit) return { error: "missing_permission:view_grants" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleGrantWhere(actor, grantId)
      const res = await client.query(
        `SELECT
           g.id,
           g.client_id,
           c.name AS client_name,
           COALESCE(g.total_amount, 0)::numeric AS total_amount,
           COALESCE(g.available_balance, 0)::numeric AS available_balance,
           GREATEST(COALESCE(g.total_amount, 0) - COALESCE(g.available_balance, 0), 0)::numeric AS remaining_amount,
           CASE
             WHEN COALESCE(g.total_amount, 0) > 0
               THEN ROUND((COALESCE(g.available_balance, 0) / g.total_amount) * 100, 2)
             ELSE 0
           END::numeric AS percentage_received,
           g.branch_id,
           b.name AS branch_name,
           g.created_at,
           g.updated_at
         FROM grants g
         JOIN clients c ON c.id = g.client_id
         LEFT JOIN branches b ON b.id = g.branch_id
         WHERE ${where}
         LIMIT 1`,
        values,
      )

      const row = res.rows[0]
      if (!row) return { error: "not_found" as const }

      return {
        grant: {
          id: String(row.id),
          client_id: row.client_id ? String(row.client_id) : "",
          client_name: String(row.client_name || ""),
          total_amount: Number(row.total_amount || 0),
          available_balance: Number(row.available_balance || 0),
          remaining_amount: Number(row.remaining_amount || 0),
          percentage_received: Number(row.percentage_received || 0),
          branch_id: row.branch_id ? String(row.branch_id) : "",
          branch_name: String(row.branch_name || ""),
          created_at: row.created_at ? String(row.created_at) : "",
          updated_at: row.updated_at ? String(row.updated_at) : "",
          can_edit: canEdit,
        },
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "not_found" ? 404 : result.error === "actor_branch_missing" ? 400 : 403
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.detail.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: grantId } = await params
  if (!grantId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

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

    const updated = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.editGrant)
      if (!allowed) return { error: "missing_permission:edit_grant" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleGrantWhere(actor, grantId)
      const existing = await client.query(
        `SELECT id, branch_id, client_id,
                COALESCE(total_amount, 0)::numeric AS total_amount,
                COALESCE(available_balance, 0)::numeric AS available_balance
         FROM grants g
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const oldRow = existing.rows[0] as Record<string, unknown>

      const targetBranchId = isSuperAdmin(actor)
        ? branchId || String(oldRow.branch_id || "")
        : String(oldRow.branch_id || actor.branch_id)

      if (!targetBranchId) return { error: "branch_id_required" as const }

      if (isSuperAdmin(actor) && branchId) {
        const branchCheck = await client.query(
          `SELECT 1 FROM branches WHERE id = $1::uuid AND institution_id = $2::uuid LIMIT 1`,
          [targetBranchId, actor.institution_id],
        )
        if ((branchCheck.rowCount ?? 0) === 0) return { error: "invalid_branch" as const }
      }

      const clientCheck = await client.query(
        `SELECT 1 FROM clients
         WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
         LIMIT 1`,
        [clientId, actor.institution_id, targetBranchId],
      )
      if ((clientCheck.rowCount ?? 0) === 0) return { error: "invalid_client" as const }

      const setParams: unknown[] = [clientId, totalAmount, availableBalance, targetBranchId]
      let scopedWhere = `g.id = $5::uuid AND g.institution_id = $6::uuid`
      setParams.push(grantId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND g.branch_id = $7::uuid`
        setParams.push(actor.branch_id)
      }

      const updateRes = await client.query(
        `UPDATE grants g
         SET client_id = $1::uuid,
             total_amount = $2,
             available_balance = $3,
             branch_id = $4::uuid,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, client_id, total_amount, available_balance, branch_id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditGrantUpdate(
        client,
        actor,
        grantId,
        grantSnapshot(oldRow),
        grantSnapshot(newRow),
        (newRow.branch_id as string | null | undefined) ?? targetBranchId,
      )

      return { id: String(newRow.id || "") }
    })

    if (updated && "error" in updated) {
      const status =
        updated.error === "not_found"
          ? 404
          : updated.error === "branch_id_required" ||
              updated.error === "invalid_branch" ||
              updated.error === "invalid_client"
            ? 400
            : 403
      return NextResponse.json({ error: updated.error }, { status })
    }

    return NextResponse.json(updated)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
