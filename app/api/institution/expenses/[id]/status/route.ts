import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditCashflowUpdate, auditExpenseUpdate, cashflowSnapshot, expenseSnapshot } from "@/lib/audit/expense-audit"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

function singleExpenseWhere(actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>, expenseId: string): { where: string; values: unknown[] } {
  let where = `e.id = $1::uuid AND e.institution_id = $2::uuid`
  const values: unknown[] = [expenseId, actor.institution_id]
  if (!isSuperAdmin(actor)) {
    where += ` AND e.branch_id = $3::uuid`
    values.push(actor.branch_id)
  }
  return { where, values }
}

/** WHERE clause placeholders start at `paramStart` (use 2 when SET already uses $1). */
function expenseUpdateWhere(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>,
  expenseId: string,
  paramStart = 1,
): { where: string; params: unknown[] } {
  const params: unknown[] = [expenseId, actor.institution_id]
  let idx = paramStart
  let where = `e.id = $${idx}::uuid AND e.institution_id = $${idx + 1}::uuid`
  idx += 2
  if (!isSuperAdmin(actor)) {
    where += ` AND e.branch_id = $${idx}::uuid`
    params.push(actor.branch_id)
  }
  return { where, params }
}

function normalizeExpenseStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

type StatusAction = "approve" | "reject" | "complete"

function parseStatusAction(body: Record<string, unknown>): StatusAction | null {
  const nextRaw = String(body.status ?? body.action ?? "").trim().toLowerCase()
  if (nextRaw === "approved" || nextRaw === "approve") return "approve"
  if (nextRaw === "rejected" || nextRaw === "reject" || nextRaw === "cancel" || nextRaw === "cancelled") {
    return "reject"
  }
  if (nextRaw === "completed" || nextRaw === "complete") return "complete"
  return null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const action = parseStatusAction(body)
  if (!action) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.status.patch.denied", { method: "PATCH", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_expense_status")
      if (!allowed) return { error: "missing_permission:edit_expense_status" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const existing = await client.query(
        `SELECT e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const ex = existing.rows[0] as Record<string, unknown> | undefined
      if (!ex) return { error: "not_found" as const }
      const expenseBranchId = String(ex.branch_id || "")
      const oldExpense = expenseSnapshot(ex)

      const currentNorm = normalizeExpenseStatus(String(ex.status || ""))

      if (action === "approve") {
        if (currentNorm !== "pending") {
          return {
            error: "expense_not_pending" as const,
            message: "Only pending expenses can be approved." as const,
          }
        }
      } else if (action === "reject") {
        if (currentNorm !== "pending" && currentNorm !== "approved") {
          return {
            error: "expense_not_pending_or_approved" as const,
            message: "Only pending or approved expenses can be cancelled." as const,
          }
        }
      } else if (currentNorm !== "active") {
        return {
          error: "expense_not_active" as const,
          message: "Only active expenses can be completed." as const,
        }
      }

      const { where: updWhere, params: updBase } = expenseUpdateWhere(actor, expenseId, 2)

      await client.query("BEGIN")
      let committed = false
      try {
        if (action === "approve") {
          const updParams: unknown[] = [actor.id, ...updBase]
          const upd = await client.query(
            `UPDATE expenses e
             SET status = 'Approved',
                 approved_by = $1::uuid,
                 approved_at = NOW(),
                 rejected_by = NULL,
                 rejected_at = NULL,
                 updated_at = NOW()
             WHERE ${updWhere}
             RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                       e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at, e.updated_at`,
            updParams,
          )
          const row = upd.rows[0] as Record<string, unknown> | undefined
          if (!row) return { error: "update_failed" as const }

          await auditExpenseUpdate(client, actor, expenseId, oldExpense, expenseSnapshot(row), expenseBranchId)

          const nameRes = await client.query(`SELECT full_name FROM users WHERE id = $1::uuid LIMIT 1`, [actor.id])
          const approved_by_name =
            nameRes.rows[0]?.full_name != null ? String(nameRes.rows[0].full_name).trim() : null

          await client.query("COMMIT")
          committed = true

          return {
            id: String(row.id),
            status: String(row.status || "Approved"),
            approved_at: row.approved_at != null ? String(row.approved_at) : null,
            updated_at: row.updated_at != null ? String(row.updated_at) : null,
            approved_by: actor.id,
            approved_by_name,
          }
        }

        if (action === "complete") {
          const updParams: unknown[] = [actor.id, ...updBase]
          const upd = await client.query(
            `UPDATE expenses e
             SET status = 'Completed',
                 completed_by = $1::uuid,
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE ${updWhere}
             RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                       e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at, e.updated_at`,
            updParams,
          )
          const row = upd.rows[0] as Record<string, unknown> | undefined
          if (!row) return { error: "update_failed" as const }

          await auditExpenseUpdate(client, actor, expenseId, oldExpense, expenseSnapshot(row), expenseBranchId)

          await client.query("COMMIT")
          committed = true

          return {
            id: String(row.id),
            status: String(row.status || "Completed"),
            completed_at: row.completed_at != null ? String(row.completed_at) : null,
            updated_at: row.updated_at != null ? String(row.updated_at) : null,
            completed_by: actor.id,
          }
        }

        const updParams: unknown[] = [actor.id, ...updBase]
        const upd = await client.query(
          `UPDATE expenses e
           SET status = 'Rejected',
               rejected_by = $1::uuid,
               rejected_at = NOW(),
               approved_by = NULL,
               approved_at = NULL,
               updated_at = NOW()
           WHERE ${updWhere}
           RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.category_id, e.branch_id,
                     e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at, e.updated_at`,
          updParams,
        )
        const row = upd.rows[0] as Record<string, unknown> | undefined
        if (!row) return { error: "update_failed" as const }

        await auditExpenseUpdate(client, actor, expenseId, oldExpense, expenseSnapshot(row), expenseBranchId)

        // Cancel is only allowed while expense is Pending or Approved; completing a cashflow
        // moves Approved → Active, so only pending lines should exist at cancel time.
        const pendingCf = await client.query(
          `SELECT id, expense_id, staff_id, client_id, payment_method::text AS payment_method, amount,
                  description, status, date::text AS date, transaction_id, completed_by, completed_at
           FROM expense_cashflows
           WHERE expense_id = $1::uuid
             AND LOWER(TRIM(COALESCE(status::text, ''))) = 'pending'
           FOR UPDATE`,
          [expenseId],
        )

        let cashflowsRejected = 0
        if ((pendingCf.rowCount ?? 0) > 0) {
          const cfUpd = await client.query(
            `UPDATE expense_cashflows
             SET status = 'Rejected',
                 completed_by = $2::uuid,
                 completed_at = NOW()
             WHERE expense_id = $1::uuid
               AND LOWER(TRIM(COALESCE(status::text, ''))) = 'pending'
             RETURNING id, expense_id, staff_id, client_id, payment_method::text AS payment_method, amount,
                       description, status, date::text AS date, transaction_id, completed_by, completed_at`,
            [expenseId, actor.id],
          )
          cashflowsRejected = cfUpd.rowCount ?? 0
          const newById = new Map(
            (cfUpd.rows as Record<string, unknown>[]).map((r) => [String(r.id), r]),
          )
          for (const oldRow of pendingCf.rows as Record<string, unknown>[]) {
            const cfId = String(oldRow.id)
            const newRow = newById.get(cfId)
            if (!newRow) continue
            await auditCashflowUpdate(
              client,
              actor,
              cfId,
              cashflowSnapshot(oldRow),
              cashflowSnapshot(newRow),
              expenseBranchId,
            )
          }
        }

        await client.query("COMMIT")
        committed = true

        return {
          id: String(row.id),
          status: String(row.status || "Rejected"),
          rejected_at: row.rejected_at != null ? String(row.rejected_at) : null,
          updated_at: row.updated_at != null ? String(row.updated_at) : null,
          rejected_by: actor.id,
          cashflows_rejected: cashflowsRejected,
        }
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:edit_expense_status" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "expense_not_pending" ||
            code === "expense_not_pending_or_approved" ||
            code === "expense_not_active"
          ? 409
        : code === "update_failed" ? 500
        : 400
      apiLog("warn", "expenses.status.patch.denied", { method: "PATCH", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.status.patch.success", { method: "PATCH", apiPath, status: 200 })
    return NextResponse.json({ ok: true, expense: result })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.status.patch.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
