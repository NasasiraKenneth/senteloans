import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import {
  auditCashflowUpdate,
  auditExpenseUpdate,
  cashflowSnapshot,
  expenseSnapshot,
} from "@/lib/audit/expense-audit"
import { insertTransactionInsertAuditLog } from "@/lib/audit/transaction-insert-audit"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"
import {
  isEditableExpenseCashflowStatus,
} from "@/lib/expenses/record-expense-cashflow-payment"
import { requireStaffSession } from "@/lib/api/rbac"
import {
  assertExpenseReadAccess,
  assertExpenseWriteAccess,
  expenseScopeWhere,
  mapExpenseMutationErrorResponse,
  mapExpenseReadErrorResponse,
} from "@/lib/api/expense-access"
import { computeExpenseCashflowPaymentTotals } from "@/lib/expenses/expense-cashflow-payment-totals"

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

function normalizeCashflowStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

function normalizeExpenseStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

/** When a cashflow row is not editable (PATCH status changes). */
function cashflowNonPendingError(currentNorm: string): { error: string; message: string } {
  if (currentNorm === "completed") {
    return {
      error: "cashflow_already_completed",
      message: "This cashflow has already been completed and cannot be edited.",
    }
  }
  if (currentNorm === "rejected") {
    return {
      error: "cashflow_already_rejected",
      message: "This cashflow has already been rejected and cannot be edited.",
    }
  }
  return {
    error: "cashflow_not_editable",
    message: "This cashflow cannot be edited because it is not pending.",
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; cashflowId: string }> },
) {
  const apiPath = getApiPath(req)
  const { id: expenseId, cashflowId } = await params
  if (!expenseId || !cashflowId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflows.get.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseReadAccess(client, sess.authUserId, ["view_expenses", "record_cashflow"])
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
        }
      }
      const { actor } = access
      const { where, values } = expenseScopeWhere(actor, expenseId)
      const res = await client.query<{
        id: string
        amount: string | number
        paid_amount: string | number
      }>(
        `SELECT
           cf.id,
           cf.amount::float AS amount,
           COALESCE((
             SELECT SUM(p.amount)::float
             FROM expense_cashflows_payments p
             WHERE p.expense_cashflow_id = cf.id
           ), 0) AS paid_amount
         FROM expense_cashflows cf
         JOIN expenses e ON e.id = cf.expense_id
         WHERE cf.id = $${values.length + 1}::uuid
           AND ${where}
         LIMIT 1`,
        [...values, cashflowId],
      )
      const row = res.rows[0]
      if (!row) return { error: "cashflow_not_found" as const }

      const amount = Number(row.amount || 0)
      const totals = computeExpenseCashflowPaymentTotals(amount, Number(row.paid_amount || 0))
      return {
        cashflow_id: String(row.id),
        amount,
        paid_amount: totals.paid_amount,
        outstanding: totals.outstanding,
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      if (code === "cashflow_not_found") {
        apiLog("warn", "expenses.cashflows.get.denied", { method: "GET", apiPath, status: 404, error: code })
        return NextResponse.json({ error: code }, { status: 404 })
      }
      const { status, body } = mapExpenseReadErrorResponse({
        error: code,
        staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
      })
      apiLog("warn", "expenses.cashflows.get.denied", { method: "GET", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.cashflows.get.success", { method: "GET", apiPath, status: 200 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.get.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; cashflowId: string }> },
) {
  const apiPath = getApiPath(req)
  const { id: expenseId, cashflowId } = await params
  if (!expenseId || !cashflowId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const nextRaw = String(body.status ?? "").trim().toLowerCase()
  if (nextRaw !== "completed" && nextRaw !== "rejected") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }
  const nextLabel = nextRaw === "completed" ? "Completed" : "Rejected"

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflows.patch.denied", { method: "PATCH", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "edit_cashflow_status")
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
      const ex = await client.query(
        `SELECT e.id, e.expense_number, e.name, e.description, e.status, e.type, e.branch_id,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expenseRow = ex.rows[0] as Record<string, unknown> | undefined
      if (!expenseRow) return { error: "not_found" as const }
      const expenseBranchId = String(expenseRow.branch_id || "")
      const oldExpenseSnapshot = expenseSnapshot(expenseRow)
      const expenseStatusNorm = normalizeExpenseStatus(String(expenseRow.status || ""))
      if (expenseStatusNorm !== "approved" && expenseStatusNorm !== "active") {
        return {
          error: "expense_not_approved_or_active" as const,
          message:
            "Cashflow status can only be changed when the expense is approved or active." as const,
        }
      }

      await client.query("BEGIN")
      let committed = false
      try {
        const lockRes = await client.query<{
          id: string
          expense_id: string
          status: string
          amount: string | number
          description: string | null
          date: string | null
          payment_method: string | null
          third_party_agent_id: string | null
          staff_id: string | null
          transaction_id: string | null
          completed_by: string | null
          completed_at: string | null
          expense_number: string
          branch_id: string
          institution_id: string
        }>(
          `SELECT cf.id, cf.expense_id, cf.status, cf.amount, cf.description, cf.date::text AS date,
                  cf.payment_method::text AS payment_method, cf.third_party_agent_id, cf.staff_id, cf.transaction_id,
                  cf.completed_by, cf.completed_at, e.expense_number, e.branch_id, e.institution_id
           FROM expense_cashflows cf
           JOIN expenses e ON e.id = cf.expense_id
           WHERE cf.id = $1::uuid AND cf.expense_id = $2::uuid
           FOR UPDATE OF cf`,
          [cashflowId, expenseId],
        )
        const cf = lockRes.rows[0]
        if (!cf) {
          return { error: "cashflow_not_found" as const }
        }
        const oldCashflow = cashflowSnapshot(cf as unknown as Record<string, unknown>)
        const current = normalizeCashflowStatus(String(cf.status || ""))
        if (!isEditableExpenseCashflowStatus(current)) {
          return cashflowNonPendingError(current)
        }

        let priorCompletedCashflowCount = 0
        if (nextRaw === "completed") {
          const cnt = await client.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c
             FROM expense_cashflows
             WHERE expense_id = $1::uuid
               AND LOWER(TRIM(COALESCE(status::text, ''))) IN ('completed', 'paid')`,
            [expenseId],
          )
          priorCompletedCashflowCount = Number(cnt.rows[0]?.c ?? 0)
        }

        const nameRes = await client.query(`SELECT full_name FROM users WHERE id = $1::uuid LIMIT 1`, [actor.id])
        const completed_by_name =
          nameRes.rows[0]?.full_name != null ? String(nameRes.rows[0].full_name).trim() : null

        if (nextRaw === "rejected") {
          const linkedTransactionId =
            cf.transaction_id != null && String(cf.transaction_id).trim() !== ""
              ? String(cf.transaction_id).trim()
              : null

          if (linkedTransactionId) {
            const txUpd = await client.query<{ id: string; status: string }>(
              `UPDATE transactions t
               SET status = 'Failed'
               WHERE t.id = $1::uuid
                 AND t.institution_id = $2::uuid
               RETURNING t.id, t.status::text AS status`,
              [linkedTransactionId, String(cf.institution_id)],
            )
            if ((txUpd.rowCount ?? 0) === 0) {
              return { error: "transaction_not_found" as const }
            }
          }

          const upd = await client.query(
            `UPDATE expense_cashflows
             SET status = $1,
                 completed_by = $2::uuid,
                 completed_at = NOW()
             WHERE id = $3::uuid AND expense_id = $4::uuid
             RETURNING id, expense_id, status, amount, description, date::text AS date,
                       payment_method::text AS payment_method, staff_id, third_party_agent_id, transaction_id,
                       completed_by, completed_at`,
            [nextLabel, actor.id, cashflowId, expenseId],
          )
          const out = upd.rows[0] as Record<string, unknown> | undefined
          if (!out) {
            return { error: "update_failed" as const }
          }
          await auditCashflowUpdate(client, actor, cashflowId, oldCashflow, cashflowSnapshot(out), expenseBranchId)
          await client.query("COMMIT")
          committed = true
          return {
            cashflow: {
              id: String(out.id),
              status: String(out.status || nextLabel),
              completed_at: out.completed_at != null ? String(out.completed_at) : null,
              completed_by: out.completed_by != null ? String(out.completed_by) : actor.id,
              completed_by_name,
              transaction_id: out.transaction_id != null ? String(out.transaction_id) : linkedTransactionId,
            },
            transaction:
              linkedTransactionId != null
                ? { id: linkedTransactionId, status: "Failed" as const }
                : undefined,
          }
        }

        const expenseNumber = String(cf.expense_number || "").trim() || String(expenseId).slice(0, 8)
        const descTrim = cf.description != null ? String(cf.description).trim() : ""
        const description = descTrim || `Expense payment - ${expenseNumber}`

        const dateStr = cf.date != null ? String(cf.date).trim() : ""
        const txDate =
          dateStr.length >= 10
            ? new Date(`${dateStr.slice(0, 10)}T12:00:00.000Z`).toISOString()
            : new Date().toISOString()

        const modeRaw = cf.payment_method != null ? String(cf.payment_method).trim() : ""
        const mode = (PAYMENT_MODES as readonly string[]).includes(modeRaw) ? modeRaw : "Cash"

        const cid = cf.third_party_agent_id != null ? String(cf.third_party_agent_id) : null
        const sid = cf.staff_id != null ? String(cf.staff_id) : null
        if (!cid && !sid) {
          return { error: "cashflow_assignee_missing" as const }
        }
        const instId = String(cf.institution_id)
        const branchId = String(cf.branch_id)

        const inserted = await insertWithTransactionNumberRetry(
          (transaction_number) =>
            client.query<{ id: string }>(
              `INSERT INTO transactions (
                 institution_id, branch_id, member_id, third_party_agent_id, staff_id, account_id, transferred_to_id, loan_id, sacco_loan_id,
                 transaction_number, type, amount, mode, description, reference_number,
                 balance_before, balance_after, processed_by, transaction_date, status
               ) VALUES (
                 $1::uuid, $2::uuid, NULL, $3::uuid, $4::uuid, NULL, NULL, NULL, NULL,
                 $5, 'Expense Payment', $6, $7::payment_mode, $8, $9,
                 NULL, NULL, $10::uuid, $11::timestamptz, 'Completed'
               ) RETURNING id`,
              [
                instId,
                branchId,
                cid,
                sid,
                transaction_number,
                Number(cf.amount || 0),
                mode,
                description,
                transaction_number,
                actor.id,
                txDate,
              ],
            ),
          { prefix: "TXN", client },
        )

        if (!inserted) {
          return { error: "transaction_insert_failed" as const }
        }

        const { row: txRow, transactionNumber } = inserted

        await insertTransactionInsertAuditLog(client, {
          institutionId: instId,
          branchId,
          userId: actor.id,
          transactionId: txRow.id,
          newValues: {
            transaction_number: transactionNumber,
            type: "Expense Payment",
            amount: Number(cf.amount || 0),
            third_party_agent_id: cid,
            staff_id: sid,
            expense_cashflow_id: cashflowId,
            expense_id: expenseId,
          },
        })

        const upd = await client.query(
          `UPDATE expense_cashflows
           SET status = $1,
               completed_by = $2::uuid,
               completed_at = NOW(),
               transaction_id = $3::uuid
           WHERE id = $4::uuid AND expense_id = $5::uuid
           RETURNING id, expense_id, status, amount, description, date::text AS date,
                     payment_method::text AS payment_method, staff_id, third_party_agent_id, transaction_id,
                     completed_by, completed_at`,
          [nextLabel, actor.id, txRow.id, cashflowId, expenseId],
        )
        const out = upd.rows[0] as Record<string, unknown> | undefined
        if (!out) {
          return { error: "update_failed" as const }
        }
        await auditCashflowUpdate(client, actor, cashflowId, oldCashflow, cashflowSnapshot(out), expenseBranchId)

        if (priorCompletedCashflowCount === 0) {
          const expUpd = await client.query(
            `UPDATE expenses e
             SET status = 'Active', updated_at = NOW()
             WHERE e.id = $1::uuid
               AND e.institution_id = $2::uuid
               AND LOWER(TRIM(COALESCE(e.status::text, ''))) = 'approved'
             RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.branch_id,
                       e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at`,
            [expenseId, actor.institution_id],
          )
          const newExpRow = expUpd.rows[0] as Record<string, unknown> | undefined
          if (newExpRow) {
            await auditExpenseUpdate(
              client,
              actor,
              expenseId,
              oldExpenseSnapshot,
              expenseSnapshot(newExpRow),
              expenseBranchId,
            )
          }
        }

        await client.query("COMMIT")
        committed = true

        return {
          cashflow: {
            id: String(out.id),
            status: String(out.status || nextLabel),
            completed_at: out.completed_at != null ? String(out.completed_at) : null,
            completed_by: out.completed_by != null ? String(out.completed_by) : actor.id,
            completed_by_name,
            transaction_id: txRow.id,
          },
          transaction: { id: txRow.id, transaction_number: transactionNumber },
          expense_status:
            priorCompletedCashflowCount === 0 && expenseStatusNorm === "approved" ? ("Active" as const) : undefined,
        }
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
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
          expense_not_approved_or_active: 409,
          cashflow_already_completed: 409,
          cashflow_already_rejected: 409,
          cashflow_not_editable: 409,
          transaction_not_found: 404,
          transaction_insert_failed: 500,
          update_failed: 500,
        },
      )
      apiLog("warn", "expenses.cashflows.patch.denied", { method: "PATCH", apiPath, status, error: code })
      return NextResponse.json(body, { status })
    }

    apiLog("info", "expenses.cashflows.patch.success", { method: "PATCH", apiPath, status: 200 })
    const r = result as { cashflow: unknown; transaction?: unknown; expense_status?: string }
    const payload: Record<string, unknown> = { ok: true, cashflow: r.cashflow }
    if (r.transaction) payload.transaction = r.transaction
    if (r.expense_status) payload.expense_status = r.expense_status
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.patch.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
