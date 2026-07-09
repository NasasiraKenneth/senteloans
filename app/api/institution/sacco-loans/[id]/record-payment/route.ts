import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { hasPermission, isSuperAdmin, resolveActorContext, SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"
import { auditLogger } from "@/lib/audit/audit-logger"
import { PAYMENT_MODES } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { createExpense, createExpenseCashflow, createExpensePayment } from "@/lib/expenses/create-expense"
import { notifySaccoLoanPaymentRecorded } from "@/lib/notifications/sacco-loan-events"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toDateOnly(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") {
    const trimmed = value.trim()
    const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
    if (ymd) return ymd[1]
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      return `${y}-${m}-${day}`
    }
    return ""
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ""
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  return ""
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: loanId } = await params
    if (!loanId || !UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const amount = Number(body.amount)
    const payment_date = String(body.payment_date ?? "").trim().slice(0, 10)
    const next_payment_date = String(body.next_payment_date ?? "").trim().slice(0, 10)
    const mode = String(body.mode ?? body.payment_mode ?? "Cash").trim()
    const reference_number = String(body.reference_number ?? body.referenceNumber ?? "").trim()
    const bank_account_id = String(body.bank_account_id ?? body.bankAccountId ?? "").trim()
    const transactionChargesRaw = body.transaction_charges
    const transactionCharges =
      transactionChargesRaw == null || transactionChargesRaw === ""
        ? 0
        : Number(transactionChargesRaw)

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next_payment_date)) {
      return NextResponse.json({ error: "invalid_next_payment_date" }, { status: 400 })
    }
    if (!(PAYMENT_MODES as readonly string[]).includes(mode)) {
      return NextResponse.json({ error: "invalid_payment_mode" }, { status: 400 })
    }
    if (!Number.isFinite(transactionCharges) || transactionCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }
    if (mode === "Cash" && transactionCharges > 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }

    const paymentModeError = validatePaymentModeInput({
      mode,
      referenceNumber: reference_number,
      bankAccountId: bank_account_id,
    })
    if (paymentModeError) {
      return NextResponse.json({ error: paymentModeError }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, { activeOnly: false })
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }
      if (isSuperAdmin(actor)) return { error: SUPER_ADMIN_WRITE_BLOCKED }
      const allowed = await hasPermission(client, actor, "record_sacco_loan_payment")
      if (!allowed) return { error: "missing_permission:record_sacco_loan_payment" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const branchCheck = await assertBranchActive(client, actor.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error,
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [loanId, actor.institution_id]
      where += " AND l.branch_id = $3"
      qparams.push(actor.branch_id)

      const loanRes = await client.query<{
        id: string
        branch_id: string
        third_party_agent_id: string
        third_party_agent_name: string
        loan_product: string | null
        next_payment_date: string | null
        tenure_months: number
        remaining_tenure_months: number | null
        outstanding_balance: string | number
        status: string
      }>(
        `SELECT l.id, l.branch_id, l.third_party_agent_id, l.loan_product, l.next_payment_date,
                l.tenure_months, l.remaining_tenure_months, l.outstanding_balance, l.status,
                COALESCE(tpa.name, '') AS third_party_agent_name
         FROM institution_loans l
         LEFT JOIN third_party_agents tpa ON tpa.id = l.third_party_agent_id
         WHERE ${where}
         LIMIT 1`,
        qparams,
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (String(loan.status || "") !== "Active") {
        return { error: "loan_not_active" as const }
      }
      const dueDateFromLoan = toDateOnly(loan.next_payment_date)
      const currentDueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateFromLoan) ? dueDateFromLoan : payment_date

      const outstandingBefore = Number(loan.outstanding_balance ?? 0)
      if (amount > outstandingBefore + 0.01) {
        return { error: "amount_exceeds_outstanding" as const, outstanding: outstandingBefore }
      }
      const outstandingAfter = Math.max(0, Math.round((outstandingBefore - amount + Number.EPSILON) * 100) / 100)
      const currentRemainingTenure = Math.max(
        0,
        Math.floor(Number(loan.remaining_tenure_months ?? loan.tenure_months ?? 0)),
      )
      const nextRemainingTenure = Math.max(0, currentRemainingTenure - 1)
      const isClosed = outstandingAfter <= 0
      const description = `${String(loan.loan_product || "Loan")} repayment`
      const loanBranchId = String(loan.branch_id || "")
      const settlementCharges = transactionCharges > 0 ? transactionCharges : null
      const loanLabel = loanId.slice(0, 8)

      let txCommitted = false
      await client.query("BEGIN")
      try {
        try {
          await settlePaymentByMode(client, {
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            amount,
            charges: settlementCharges,
            mode,
            flow: "outflow",
            actor,
            bankAccountId: bank_account_id || null,
            referenceNumber: reference_number,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            if (e.code === "insufficient_bank_balance") {
              return { error: "bank_account_insufficient_funds" as const }
            }
            return { error: e.code as typeof e.code }
          }
          throw e
        }

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            thirdPartyAgentId: loan.third_party_agent_id,
            saccoLoanId: loanId,
            bankAccountId: bank_account_id || null,
            type: "External Loan Payment",
            amount,
            mode,
            description,
            referenceNumber: reference_number || null,
            balanceBefore: outstandingBefore,
            balanceAfter: outstandingAfter,
            charges: settlementCharges || null,
            processedBy: actor.id,
            transactionDate: payment_date,
            prefix: "TXN",
          })
        } catch (e: unknown) {
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "repayment_transaction_create_failed" as const }
          }
          throw e
        }

        if (settlementCharges) {
          const chargesExpenseDescription = `External loan repayment charges for loan ${loanLabel}`

          const chargesTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            thirdPartyAgentId: loan.third_party_agent_id,
            saccoLoanId: loanId,
            bankAccountId: bank_account_id || null,
            type: "Expense Payment",
            amount: settlementCharges,
            mode,
            description: chargesExpenseDescription,
            referenceNumber: reference_number || null,
            charges: null,
            processedBy: actor.id,
            transactionDate: payment_date,
            prefix: "TXN",
          })

          const expense = await createExpense(
            client,
            {
              institutionId: actor.institution_id,
              branchId: loanBranchId,
              createdBy: actor.id,
              name: "Transaction charges",
              status: "Completed",
              type: "Operating-expenses",
              description: chargesExpenseDescription,
              completedBy: actor.id,
              completedAt: new Date(),
            },
            { actor, branchId: loanBranchId },
          )

          const cashflow = await createExpenseCashflow(
            client,
            {
              expenseId: expense.id,
              transactionId: chargesTx.id,
              amount: settlementCharges,
              paymentMethod: mode,
              description: "External loan repayment charges",
              status: "Fully Paid",
              date: payment_date,
              completedBy: actor.id,
              completedAt: new Date(),
            },
            { actor, branchId: loanBranchId },
          )

          await createExpensePayment(
            client,
            {
              expenseId: expense.id,
              expenseCashflowId: cashflow.id,
              transactionId: chargesTx.id,
              amount: settlementCharges,
              paymentMethod: mode,
              date: payment_date,
              createdBy: actor.id,
            },
            { actor, branchId: loanBranchId },
          )
        }

        const transactionId = tx.id

        const repaymentRes = await client.query<{ id: string }>(
          `INSERT INTO institution_loan_repayments (
             loan_id, transaction_id, due_date, amount_paid, payment_date, status
           ) VALUES ($1, $2, $3, $4, $5, 'Paid'::repayment_status)
           RETURNING id`,
          [loanId, transactionId, currentDueDate, amount, payment_date],
        )
        const repaymentId = String(repaymentRes.rows[0]?.id || "")
        if (!repaymentId) {
          return { error: "repayment_insert_failed" as const }
        }
        await auditLogger.logInsert(
          "institution_loan_repayments",
          repaymentId,
          {
            loan_id: loanId,
            transaction_id: transactionId,
            due_date: currentDueDate,
            amount_paid: amount,
            payment_date,
            status: "Paid",
          },
          actor.institution_id,
          actor.id,
          { branch_id: loanBranchId },
          client,
        )

        const loanStatusBefore = String(loan.status || "")

        await client.query(
          `UPDATE institution_loans
           SET remaining_tenure_months = $1,
               outstanding_balance = $2,
               next_payment_date = CASE WHEN $6 THEN NULL ELSE $3::date END,
               status = CASE WHEN $6 THEN 'Closed'::loan_status_type ELSE status END,
               modified_by = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [nextRemainingTenure, outstandingAfter, next_payment_date, actor.id, loanId, isClosed],
        )
        await auditLogger.logUpdate(
          "institution_loans",
          loanId,
          {
            remaining_tenure_months: currentRemainingTenure,
            outstanding_balance: outstandingBefore,
            next_payment_date: currentDueDate,
            status: loanStatusBefore,
          },
          {
            remaining_tenure_months: nextRemainingTenure,
            outstanding_balance: outstandingAfter,
            next_payment_date: isClosed ? null : next_payment_date,
            status: isClosed ? "Closed" : loanStatusBefore,
          },
          actor.institution_id,
          actor.id,
          { branch_id: loanBranchId },
          client,
        )

        await client.query("COMMIT")
        txCommitted = true

        return {
          ok: true as const,
          postCommit: {
            actorId: actor.id,
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            agent: {
              id: String(loan.third_party_agent_id || ""),
              name: String(loan.third_party_agent_name || "").trim() || "External lender",
            },
            loan: {
              id: loanId,
              loan_product: loan.loan_product != null ? String(loan.loan_product) : null,
            },
            payment: {
              amount,
              balance_after: outstandingAfter,
              payment_date,
              status: isClosed ? "Closed" : "Active",
            },
            transaction: {
              id: tx.id,
              transaction_number: tx.transactionNumber,
            },
          },
        }
      } catch (e) {
        if (!txCommitted) await client.query("ROLLBACK")
        throw e
      }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "user_not_linked" ||
        err === "missing_permission:record_sacco_loan_payment" ||
        err === "staff_inactive" ||
        err === "branch_inactive" ||
        err === "branch_not_found" ||
        err === SUPER_ADMIN_WRITE_BLOCKED
          ? 403
          : err === "staff_not_found"
            ? 404
            : err === "actor_branch_missing"
              ? 400
              : err === "not_found"
                ? 404
                : err === "loan_not_active"
                  ? 400
                  : 400
      apiLog("warn", "sacco_loans.record_payment.denied", { method: "POST", apiPath, status: statusCode, error: err })
      const payload: Record<string, unknown> = { error: err }
      if ("staffStatus" in result && result.staffStatus) payload.staff_status = result.staffStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus as BranchStatus
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "sacco_loans.record_payment.success", { method: "POST", apiPath, status: 201, loanId })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifySaccoLoanPaymentRecorded({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            agent: ctx.agent,
            loan: ctx.loan,
            payment: ctx.payment,
            transaction: ctx.transaction,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "sacco_loans.record_payment.notifications_dispatched"
            : "sacco_loans.record_payment.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            loanId,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "sacco_loans.record_payment.notifications_failed", {
          method: "POST",
          apiPath,
          status: 201,
          loanId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.record_payment.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
