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
    const amount = Number(body?.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, FINANCE_PERMISSIONS.editGrantAmount)
      if (!allowed) return { error: "missing_permission:edit_grant_amount" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleGrantWhere(actor, grantId)
      const existing = await client.query(
        `SELECT
           id,
           branch_id,
           client_id,
           COALESCE(total_amount, 0)::numeric AS total_amount,
           COALESCE(available_balance, 0)::numeric AS available_balance
         FROM senteloans_grants g
         WHERE ${where}
         LIMIT 1`,
        values,
      )
      if ((existing.rowCount ?? 0) === 0) return { error: "not_found" as const }
      const oldRow = existing.rows[0] as Record<string, unknown>

      const totalAmount = Number(oldRow.total_amount || 0)
      const currentAvailable = Number(oldRow.available_balance || 0)
      const remaining = Math.max(0, totalAmount - currentAvailable)

      if (totalAmount > 0 && currentAvailable >= totalAmount) {
        return {
          error: "grant_already_complete" as const,
          message: "This grant is already complete — the full pledge has been received." as const,
        }
      }

      if (amount > remaining) {
        return {
          error: "amount_exceeds_remaining" as const,
          message: "Amount received cannot exceed the remaining grant balance." as const,
        }
      }

      const setParams: unknown[] = [amount]
      let scopedWhere = `g.id = $2::uuid AND g.institution_id = $3::uuid`
      setParams.push(grantId, actor.institution_id)
      if (!isSuperAdmin(actor)) {
        scopedWhere += ` AND g.branch_id = $4::uuid`
        setParams.push(actor.branch_id)
      }
      scopedWhere +=
        ` AND COALESCE(g.available_balance, 0) + $1 <= COALESCE(g.total_amount, 0)` +
        ` AND COALESCE(g.available_balance, 0) < COALESCE(g.total_amount, 0)`

      const updateRes = await client.query(
        `UPDATE senteloans_grants g
         SET available_balance = COALESCE(available_balance, 0) + $1,
             updated_at = NOW()
         WHERE ${scopedWhere}
         RETURNING id, client_id, total_amount, available_balance, branch_id`,
        setParams,
      )

      if ((updateRes.rowCount ?? 0) === 0) {
        return {
          error: "grant_already_complete" as const,
          message:
            "This grant has changed since you opened it. Reload the table and try again." as const,
        }
      }

      const newRow = updateRes.rows[0] as Record<string, unknown>

      await auditGrantUpdate(
        client,
        actor,
        grantId,
        grantSnapshot(oldRow),
        { ...grantSnapshot(newRow), _action: "add_amount", _delta: amount },
        (newRow.branch_id as string | null | undefined) ?? (oldRow.branch_id as string | null | undefined),
      )

      return {
        id: String(newRow.id || ""),
        available_balance: Number(newRow.available_balance || 0),
        total_amount: Number(newRow.total_amount || 0),
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const status =
        code === "not_found"
          ? 404
          : code === "grant_already_complete" || code === "amount_exceeds_remaining"
            ? 409
            : code === "invalid_amount"
              ? 400
              : 403
      const message = "message" in result && result.message ? result.message : undefined
      return NextResponse.json({ error: result.error, ...(message ? { message } : {}) }, { status })
    }

    apiLog("info", "finances.grants.amount.update.success", { method: "PATCH", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.grants.amount.update.error", {
      method: "PATCH",
      apiPath,
      status: 500,
      error: err?.message,
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
