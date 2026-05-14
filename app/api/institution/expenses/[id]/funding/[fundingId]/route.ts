import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { expenseFundingStatusBlock } from "@/lib/api/expense-funding-guard"
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; fundingId: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId, fundingId } = await params
  if (!expenseId || !fundingId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const sourceType = String(body.type || body.source_type || "").trim().toLowerCase()
  const amount = Number(body.amount ?? 0)
  const loanIdRaw = body.loanId ?? body.loan_id
  const loanId = loanIdRaw != null && String(loanIdRaw).trim() !== "" ? String(loanIdRaw).trim() : null

  if (!["savings", "shares", "reserves", "loan", "grant"].includes(sourceType)) {
    return NextResponse.json({ error: "invalid_funding_type" }, { status: 400 })
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }
  if (sourceType === "loan" && !loanId) {
    return NextResponse.json({ error: "loan_id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.funding.update.denied", { method: "PATCH", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_expense_funding")
      if (!allowed) return { error: "missing_permission:edit_expense_funding" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const ex = await client.query<{ id: string; status: string }>(
        `SELECT e.id, e.status FROM senteloans_expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = ex.rows[0]
      if (!expense) return { error: "not_found" as const }
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

      if (sourceType === "loan" && loanId) {
        const lr = await client.query(
          `SELECT id FROM senteloans_institution_loans
           WHERE id = $1::uuid AND institution_id = $2::uuid
           LIMIT 1`,
          [loanId, actor.institution_id],
        )
        if ((lr.rowCount ?? 0) === 0) return { error: "invalid_loan" as const }
      }

      const branchJoin = isSuperAdmin(actor) ? "" : " AND e.branch_id = $7::uuid"
      const updParams: unknown[] = [
        sourceType,
        sourceType === "loan" ? loanId : null,
        amount,
        fundingId,
        expenseId,
        actor.institution_id,
      ]
      if (!isSuperAdmin(actor)) updParams.push(actor.branch_id)

      const upd = await client.query(
        `UPDATE senteloans_expense_funding_sources f
         SET source_type = $1,
             loan_id = $2::uuid,
             amount = $3
         FROM senteloans_expenses e
         WHERE f.id = $4::uuid
           AND f.expense_id = $5::uuid
           AND e.id = f.expense_id
           AND e.institution_id = $6::uuid
           ${branchJoin}
         RETURNING f.id, f.source_type, f.loan_id, f.amount::float, f.created_at`,
        updParams,
      )
      if ((upd.rowCount ?? 0) === 0) return { error: "funding_not_found" as const }
      const row = upd.rows[0] as Record<string, unknown>
      return {
        id: String(row.id),
        source_type: String(row.source_type || ""),
        loan_id: row.loan_id != null ? String(row.loan_id) : null,
        amount: Number(row.amount || 0),
        created_at: row.created_at != null ? String(row.created_at) : "",
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:edit_expense_funding" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "funding_not_found" ? 404
        : code === "expense_already_completed" || code === "expense_already_rejected" ? 409
        : code === "invalid_loan" ? 400
        : 400
      apiLog("warn", "expenses.funding.update.denied", { method: "PATCH", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.funding.update.success", { method: "PATCH", apiPath, status: 200 })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.funding.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fundingId: string }> }) {
  const apiPath = getApiPath(_req)
  const { id: expenseId, fundingId } = await params
  if (!expenseId || !fundingId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.funding.delete.denied", { method: "DELETE", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "delete_expense_funding")
      if (!allowed) return { error: "missing_permission:delete_expense_funding" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const { where, values } = singleExpenseWhere(actor, expenseId)
      const ex = await client.query<{ id: string; status: string }>(
        `SELECT e.id, e.status FROM senteloans_expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = ex.rows[0]
      if (!expense) return { error: "not_found" as const }
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

      const branchJoin = isSuperAdmin(actor) ? "" : " AND e.branch_id = $4::uuid"
      const delParams: unknown[] = isSuperAdmin(actor)
        ? [fundingId, expenseId, actor.institution_id]
        : [fundingId, expenseId, actor.institution_id, actor.branch_id]

      const del = await client.query(
        `DELETE FROM senteloans_expense_funding_sources f
         USING senteloans_expenses e
         WHERE f.id = $1::uuid
           AND f.expense_id = $2::uuid
           AND e.id = f.expense_id
           AND e.institution_id = $3::uuid
           ${branchJoin}
         RETURNING f.id`,
        delParams,
      )
      if ((del.rowCount ?? 0) === 0) return { error: "funding_not_found" as const }
      return { ok: true as const }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const statusCode =
        code === "missing_permission:delete_expense_funding" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "funding_not_found" ? 404
        : code === "expense_already_completed" || code === "expense_already_rejected" ? 409
        : 400
      apiLog("warn", "expenses.funding.delete.denied", { method: "DELETE", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.funding.delete.success", { method: "DELETE", apiPath, status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.funding.delete.error", { method: "DELETE", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
