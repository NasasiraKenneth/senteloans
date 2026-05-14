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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
      apiLog("warn", "expenses.funding.create.denied", { method: "POST", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "add_expense_funding")
      if (!allowed) return { error: "missing_permission:add_expense_funding" as const }
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

      const ins = await client.query(
        `INSERT INTO senteloans_expense_funding_sources (expense_id, source_type, loan_id, amount)
         VALUES ($1::uuid, $2, $3::uuid, $4)
         RETURNING id, source_type, loan_id, amount::float, created_at`,
        [expenseId, sourceType, sourceType === "loan" ? loanId : null, amount],
      )
      const row = ins.rows[0] as Record<string, unknown> | undefined
      if (!row) return { error: "insert_failed" as const }

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
        code === "missing_permission:add_expense_funding" ? 403
        : code === "user_not_linked" ? 403
        : code === "actor_branch_missing" ? 400
        : code === "not_found" ? 404
        : code === "expense_already_completed" || code === "expense_already_rejected" ? 409
        : code === "invalid_loan" ? 400
        : 400
      apiLog("warn", "expenses.funding.create.denied", { method: "POST", apiPath, status: statusCode, error: code })
      const payload: { error: string; message?: string } = { error: code }
      if ("message" in result && typeof result.message === "string" && result.message.trim()) {
        payload.message = result.message.trim()
      }
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "expenses.funding.create.success", { method: "POST", apiPath, status: 201 })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.funding.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
