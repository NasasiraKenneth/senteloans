import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { expenseFundingStatusBlock } from "@/lib/api/expense-funding-guard"
import { auditFundingDelete, auditFundingUpdate, fundingSnapshot } from "@/lib/audit/expense-audit"
import { requireStaffSession } from "@/lib/api/rbac"
import {
  assertExpenseWriteAccess,
  expenseScopeWhere,
  mapExpenseMutationErrorResponse,
} from "@/lib/api/expense-access"

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
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "edit_expense_funding")
      if (!access.ok) {
        return {
          error: access.error,
          message: access.message,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = expenseScopeWhere(actor, expenseId)
      const ex = await client.query<{ id: string; status: string; branch_id: string }>(
        `SELECT e.id, e.status, e.branch_id FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = ex.rows[0]
      if (!expense) return { error: "not_found" as const }
      const expenseBranchId = String(expense.branch_id || "")
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

      if (sourceType === "loan" && loanId) {
        const lr = await client.query(
          `SELECT id FROM institution_loans
           WHERE id = $1::uuid AND institution_id = $2::uuid
           LIMIT 1`,
          [loanId, actor.institution_id],
        )
        if ((lr.rowCount ?? 0) === 0) return { error: "invalid_loan" as const }
      }

      const prev = await client.query(
        `SELECT f.id, f.expense_id, f.source_type, f.loan_id, f.amount
         FROM expense_funding_sources f
         JOIN expenses e ON e.id = f.expense_id
         WHERE f.id = $1::uuid
           AND f.expense_id = $2::uuid
           AND e.institution_id = $3::uuid
           AND e.branch_id = $4::uuid
         LIMIT 1`,
        [fundingId, expenseId, actor.institution_id, actor.branch_id],
      )
      const prevRow = prev.rows[0] as Record<string, unknown> | undefined
      if (!prevRow) return { error: "funding_not_found" as const }
      const oldFunding = fundingSnapshot(prevRow)

      const upd = await client.query(
        `UPDATE expense_funding_sources f
         SET source_type = $1,
             loan_id = $2::uuid,
             amount = $3
         FROM expenses e
         WHERE f.id = $4::uuid
           AND f.expense_id = $5::uuid
           AND e.id = f.expense_id
           AND e.institution_id = $6::uuid
           AND e.branch_id = $7::uuid
         RETURNING f.id, f.expense_id, f.source_type, f.loan_id, f.amount::float, f.created_at`,
        [sourceType, sourceType === "loan" ? loanId : null, amount, fundingId, expenseId, actor.institution_id, actor.branch_id],
      )
      if ((upd.rowCount ?? 0) === 0) return { error: "funding_not_found" as const }
      const row = upd.rows[0] as Record<string, unknown>
      await auditFundingUpdate(client, actor, fundingId, oldFunding, fundingSnapshot(row), expenseBranchId)
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
      const { status, body } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        {
          expense_already_completed: 409,
          expense_already_rejected: 409,
        },
      )
      apiLog("warn", "expenses.funding.update.denied", { method: "PATCH", apiPath, status, error: code })
      return NextResponse.json(body, { status })
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
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "delete_expense_funding")
      if (!access.ok) {
        return {
          error: access.error,
          message: access.message,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = expenseScopeWhere(actor, expenseId)
      const ex = await client.query<{ id: string; status: string; branch_id: string }>(
        `SELECT e.id, e.status, e.branch_id FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = ex.rows[0]
      if (!expense) return { error: "not_found" as const }
      const expenseBranchId = String(expense.branch_id || "")
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

      const delParams: unknown[] = [fundingId, expenseId, actor.institution_id, actor.branch_id]

      const prev = await client.query(
        `SELECT f.id, f.expense_id, f.source_type, f.loan_id, f.amount
         FROM expense_funding_sources f
         JOIN expenses e ON e.id = f.expense_id
         WHERE f.id = $1::uuid
           AND f.expense_id = $2::uuid
           AND e.institution_id = $3::uuid
           AND e.branch_id = $4::uuid
         LIMIT 1`,
        delParams,
      )
      const prevRow = prev.rows[0] as Record<string, unknown> | undefined
      if (!prevRow) return { error: "funding_not_found" as const }
      const oldFunding = fundingSnapshot(prevRow)

      const del = await client.query(
        `DELETE FROM expense_funding_sources f
         USING expenses e
         WHERE f.id = $1::uuid
           AND f.expense_id = $2::uuid
           AND e.id = f.expense_id
           AND e.institution_id = $3::uuid
           AND e.branch_id = $4::uuid
         RETURNING f.id`,
        delParams,
      )
      if ((del.rowCount ?? 0) === 0) return { error: "funding_not_found" as const }
      await auditFundingDelete(client, actor, fundingId, oldFunding, expenseBranchId)
      return { ok: true as const }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const { status, body } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        {
          expense_already_completed: 409,
          expense_already_rejected: 409,
        },
      )
      apiLog("warn", "expenses.funding.delete.denied", { method: "DELETE", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.funding.delete.success", { method: "DELETE", apiPath, status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.funding.delete.error", { method: "DELETE", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
