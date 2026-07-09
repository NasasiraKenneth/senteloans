import { NextResponse } from "next/server"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { auditExpenseUpdate, expenseSnapshot } from "@/lib/audit/expense-audit"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { expenseFundingStatusBlock } from "@/lib/api/expense-funding-guard"
import { computeExpenseCashflowPaymentTotals } from "@/lib/expenses/expense-cashflow-payment-totals"
import {
  isExpenseCashflowPaymentRecordable,
  mapExpensePaymentSettlementFailure,
  recordExpenseCashflowSettlementPayment,
} from "@/lib/expenses/record-expense-cashflow-payment"
import { notifyExpenseCashflowPaymentRecorded } from "@/lib/notifications/expense-events"
import { PaymentSettlementFailure, validatePaymentModeInput } from "@/lib/finances/settle-payment-mode"
import { requireStaffSession } from "@/lib/api/rbac"
import {
  assertExpenseWriteAccess,
  expenseScopeWhere,
  mapExpenseMutationErrorResponse,
} from "@/lib/api/expense-access"

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

function normalizeExpenseStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100

type ExpenseCashflowRecordPaymentPostCommit = {
  actorId: string
  institutionId: string
  branchId: string
  currency: string
  assigneeName: string
  expense: {
    id: string
    name: string
    expense_number: string
  }
  cashflow: {
    id: string
    amount: number
    status: string
    outstanding: number
  }
  transaction: {
    id: string
    transaction_number: string
    amount: number
  }
}

export async function POST(
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

  const amount = Number(body.amount ?? 0)
  const mode = String(body.mode ?? body.payment_method ?? "").trim()
  const descriptionRaw = body.description
  const description =
    descriptionRaw === null || descriptionRaw === undefined || String(descriptionRaw).trim() === ""
      ? null
      : String(descriptionRaw).trim()
  const referenceNumber = String(body.reference_number ?? body.referenceNumber ?? "").trim()
  const bankAccountId = String(body.bank_account_id ?? body.bankAccountId ?? "").trim()
  const paymentDateRaw =
    typeof body.payment_date === "string"
      ? body.payment_date.trim()
      : typeof body.paymentDate === "string"
        ? body.paymentDate.trim()
        : ""
  const transactionChargesRaw = body.transaction_charges ?? body.transactionCharges
  const transactionCharges =
    transactionChargesRaw == null || transactionChargesRaw === ""
      ? 0
      : Number(transactionChargesRaw)

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }
  if (!mode || !PAYMENT_MODES.includes(mode as (typeof PAYMENT_MODES)[number])) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
  }
  if (!paymentDateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)) {
    return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
  }
  if (!Number.isFinite(transactionCharges) || transactionCharges < 0) {
    return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
  }
  if (mode === "Cash" && transactionCharges > 0) {
    return NextResponse.json({ error: "transaction_charges_not_allowed" }, { status: 400 })
  }

  const paymentModeError = validatePaymentModeInput({
    mode,
    referenceNumber,
    bankAccountId,
  })
  if (paymentModeError) {
    return NextResponse.json({ error: paymentModeError }, { status: 400 })
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflows.record_payment.denied", {
        method: "POST",
        apiPath,
        status: sess.status,
        error: sess.error,
      })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "record_cashflow")
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
      const exRes = await client.query(
        `SELECT e.id, e.branch_id, e.status, e.expense_number, e.name, e.description, e.type,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = exRes.rows[0] as Record<string, unknown> | undefined
      if (!expense) return { error: "not_found" as const }
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

      const expenseStatusNorm = normalizeExpenseStatus(String(expense.status || ""))
      if (expenseStatusNorm !== "approved" && expenseStatusNorm !== "active") {
        return {
          error: "expense_not_approved_or_active" as const,
          message:
            "Payments can only be recorded when the expense is approved or active." as const,
        }
      }

      const branchId = String(expense.branch_id || "")
      const instId = actor.institution_id
      const expenseNumber = String(expense.expense_number || "").trim() || expenseId.slice(0, 8)
      const oldExpenseSnapshot = expenseSnapshot(expense)

      const cfRes = await client.query<{
        id: string
        amount: string | number
        status: string
        staff_id: string | null
        third_party_agent_id: string | null
        paid_amount: string | number
        staff_name: string | null
        agent_name: string | null
      }>(
        `SELECT
           cf.id,
           cf.amount::float AS amount,
           cf.status,
           cf.staff_id,
           cf.third_party_agent_id,
           COALESCE((
             SELECT SUM(p.amount)::float
             FROM expense_cashflows_payments p
             WHERE p.expense_cashflow_id = cf.id
           ), 0) AS paid_amount,
           su.full_name AS staff_name,
           c.name AS agent_name
         FROM expense_cashflows cf
         JOIN expenses e ON e.id = cf.expense_id
         LEFT JOIN users su ON su.id = cf.staff_id
         LEFT JOIN third_party_agents c ON c.id = cf.third_party_agent_id
         WHERE cf.id = $${values.length + 1}::uuid AND ${where}
         LIMIT 1`,
        [...values, cashflowId],
      )
      const cf = cfRes.rows[0]
      if (!cf) return { error: "cashflow_not_found" as const }

      const cashflowStatus = String(cf.status || "")
      if (!isExpenseCashflowPaymentRecordable(cashflowStatus)) {
        return { error: "cashflow_not_payable" as const }
      }

      const staffId = cf.staff_id != null ? String(cf.staff_id) : null
      const thirdPartyAgentId =
        cf.third_party_agent_id != null ? String(cf.third_party_agent_id) : null
      if (!staffId && !thirdPartyAgentId) {
        return { error: "cashflow_assignee_missing" as const }
      }

      const staffName = cf.staff_name != null ? String(cf.staff_name).trim() : ""
      const agentName = cf.agent_name != null ? String(cf.agent_name).trim() : ""
      const assigneeName = staffId
        ? staffName || "Staff"
        : agentName || "Third party agent"

      const currencyRes = await client.query<{ currency: string | null }>(
        `SELECT currency FROM config WHERE branch_id = $1::uuid LIMIT 1`,
        [branchId],
      )
      const currency = currencyRes.rows[0]?.currency || "UGX"

      const cashflowAmount = Number(cf.amount || 0)
      const paidSoFar = Number(cf.paid_amount || 0)
      const totals = computeExpenseCashflowPaymentTotals(cashflowAmount, paidSoFar)
      if (totals.outstanding <= 0) {
        return { error: "cashflow_fully_paid" as const }
      }
      if (amount > totals.outstanding + 0.01) {
        return {
          error: "amount_exceeds_outstanding" as const,
          outstanding: totals.outstanding,
        }
      }

      await client.query("BEGIN")
      let committed = false
      try {
        const cnt = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c
           FROM expense_cashflows
           WHERE expense_id = $1::uuid
             AND LOWER(TRIM(COALESCE(status::text, ''))) IN ('completed', 'paid', 'fully paid')`,
          [expenseId],
        )
        const priorCompletedCashflowCount = Number(cnt.rows[0]?.c ?? 0)

        let settled: Awaited<ReturnType<typeof recordExpenseCashflowSettlementPayment>>
        try {
          settled = await recordExpenseCashflowSettlementPayment({
            client,
            actor,
            institutionId: instId,
            branchId,
            expenseId,
            expenseNumber,
            cashflowId,
            staffId,
            thirdPartyAgentId,
            cashflowAmount,
            paidSoFar,
            paymentAmount: round2(amount),
            mode,
            date: paymentDateRaw,
            description,
            referenceNumber,
            bankAccountId,
            charges: transactionCharges,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            return { error: mapExpensePaymentSettlementFailure(e) as string }
          }
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "transaction_insert_failed" as const }
          }
          if (msg === "cashflow_not_found" || msg === "cashflow_update_failed") {
            return { error: "cashflow_not_found" as const }
          }
          throw e
        }

        let expenseStatus: string | undefined
        if (priorCompletedCashflowCount === 0 && expenseStatusNorm === "approved") {
          const expUpd = await client.query(
            `UPDATE expenses e
             SET status = 'Active', updated_at = NOW()
             WHERE e.id = $1::uuid
               AND e.institution_id = $2::uuid
               AND LOWER(TRIM(COALESCE(e.status::text, ''))) = 'approved'
             RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.branch_id,
                       e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at`,
            [expenseId, instId],
          )
          const newExpRow = expUpd.rows[0] as Record<string, unknown> | undefined
          if (newExpRow) {
            await auditExpenseUpdate(
              client,
              actor,
              expenseId,
              oldExpenseSnapshot,
              expenseSnapshot(newExpRow),
              branchId,
            )
            expenseStatus = "Active"
          }
        }

        await client.query("COMMIT")
        committed = true

        const postCommit: ExpenseCashflowRecordPaymentPostCommit = {
          actorId: actor.id,
          institutionId: instId,
          branchId,
          currency,
          assigneeName,
          expense: {
            id: expenseId,
            name: String(expense.name || ""),
            expense_number: expenseNumber,
          },
          cashflow: {
            id: cashflowId,
            amount: cashflowAmount,
            status: settled.cashflowStatus,
            outstanding: settled.outstanding,
          },
          transaction: {
            id: settled.transactionId,
            transaction_number: settled.transactionNumber,
            amount: round2(amount),
          },
        }

        return {
          ok: true,
          cashflow_id: cashflowId,
          expense_payment_id: settled.expensePayment.id,
          paid_amount: settled.paidAmount,
          outstanding: settled.outstanding,
          cashflow_status: settled.cashflowStatus,
          transaction: {
            id: settled.transactionId,
            transaction_number: settled.transactionNumber,
            balance_before: round2(totals.outstanding),
            balance_after: settled.outstanding,
          },
          ...(settled.chargesExpenseId
            ? {
                charges_expense_id: settled.chargesExpenseId,
                charges_transaction_id: settled.chargesTransactionId,
              }
            : {}),
          expense_status: expenseStatus,
          postCommit,
        }
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const { status, body: errBody } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        {
          not_found: 404,
          cashflow_not_found: 404,
          expense_not_approved_or_active: 409,
          cashflow_not_payable: 409,
          cashflow_fully_paid: 409,
          amount_exceeds_outstanding: 400,
          bank_account_insufficient_funds: 409,
          insufficient_cash_balance: 409,
          insufficient_mobile_money_balance: 409,
          transaction_insert_failed: 500,
        },
      )
      if ("outstanding" in result) {
        errBody.outstanding = (result as { outstanding?: number }).outstanding
      }
      apiLog("warn", "expenses.cashflows.record_payment.denied", {
        method: "POST",
        apiPath,
        status,
        error: code,
      })
      return NextResponse.json(errBody, { status })
    }

    apiLog("info", "expenses.cashflows.record_payment.success", {
      method: "POST",
      apiPath,
      status: 201,
    })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyExpenseCashflowPaymentRecorded({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            expense: {
              id: ctx.expense.id,
              name: ctx.expense.name,
              expense_number: ctx.expense.expense_number,
            },
            cashflow: ctx.cashflow,
            assigneeName: ctx.assigneeName,
            transaction: ctx.transaction,
            currency: ctx.currency,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "expenses.cashflows.record_payment.notifications_dispatched"
            : "expenses.cashflows.record_payment.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            expenseId,
            cashflowId,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "expenses.cashflows.record_payment.notifications_failed", {
          method: "POST",
          apiPath,
          status: 201,
          expenseId,
          cashflowId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    const { postCommit: _postCommit, ...responseBody } = result as Record<string, unknown>
    return NextResponse.json(responseBody, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.record_payment.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
