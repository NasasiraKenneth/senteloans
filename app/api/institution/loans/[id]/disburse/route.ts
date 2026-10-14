import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { notifyLoanStatusChanged } from "@/lib/notifications/loan-events"
import { enqueueLoanStatusEmails } from "@/lib/email/loan-emails"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  buildRepaymentSchedule,
  calculateCompleteDisbursementAmount,
  calculateLoanTerms,
} from "@/lib/loans/calculations"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { createExpense, createExpenseCashflow, createExpensePayment } from "@/lib/expenses/create-expense"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { PAYMENT_MODES } from "@/lib/finances/payment-mode"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { loanWriteDenialBody, loanWriteDenialStatus } from "@/lib/loans/write-denial"

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

/** Normalize DB date (Date or string) to YYYY-MM-DD. */
function toDateString(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = v.getMonth() + 1
    const d = v.getDate()
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    }
  }
  const s = String(v ?? "").slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.disburse.invalid_request", { method: "POST", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loans.disburse.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    if (session.user.type !== "staff") {
      apiLog("warn", "loans.disburse.denied", { method: "POST", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const disbursement_mode = PAYMENT_MODES.includes(body.disbursement_mode as (typeof PAYMENT_MODES)[number])
      ? (body.disbursement_mode as string)
      : "Cash"
    const disbursement_type =
      typeof body.disbursement_type === "string" ? body.disbursement_type.trim().toLowerCase() : "complete"
    const disbursement_notes = typeof body.notes === "string" ? body.notes.trim() : ""
    const disbursement_amount = Number.isFinite(Number(body.disbursement_amount))
      ? Number(body.disbursement_amount)
      : null
    const disbursement_date =
      typeof body.disbursement_date === "string" && body.disbursement_date.trim()
        ? body.disbursement_date.trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    const referenceNumberInput =
      typeof body.reference_number === "string"
        ? body.reference_number.trim()
        : typeof body.referenceNumber === "string"
          ? body.referenceNumber.trim()
          : ""
    const bankAccountIdInput = typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""
    const transactionChargesRaw = body.transaction_charges
    const transactionCharges =
      transactionChargesRaw == null || transactionChargesRaw === ""
        ? 0
        : Number(transactionChargesRaw)

    if (disbursement_type !== "complete" && disbursement_type !== "partial") {
      return NextResponse.json(loanWriteDenialBody({ error: "disbursement_type_not_supported_yet" }), {
        status: 400,
      })
    }

    const newStatus = disbursement_type === "partial" ? "Partially Disbursed" : "Fully Disbursed"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      if (actor.branch_id) {
        const branchCheck = await assertBranchActive(client, actor.branch_id)
        if (!branchCheck.ok) {
          return {
            error: branchCheck.error,
            branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
          }
        }
      }

      const allowed = await hasPermission(client, actor, "disburse_loan")
      if (!allowed) return { error: "missing_permission:disburse_loan" as const }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, application_id, status, approved_at, total_amount, principal_amount, interest_rate, tenure_months, loan_product_id, loan_type, disbursement_balance
         FROM loans
         WHERE id = $1`,
        [id],
      )
      const actorRes = await client.query(`SELECT id, institution_id, branch_id FROM users WHERE id = $1`, [actor.id])
      const loan = loanRes.rows[0]
      const actorRow = actorRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (!actorRow) return { error: "user_not_linked" as const }
      if (loan.institution_id !== actorRow.institution_id) return { error: "cross_tenant_operation_forbidden" as const }
      if (!isSuperAdmin(actor) && String(loan.branch_id) !== String(actorRow.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }
      const loanBranchId = String(loan.branch_id || "")
      if (!loanBranchId) return { error: "loan_branch_missing" as const }

      const currentStatus = String(loan.status || "")
      const normalizedLoanType = String(loan.loan_type || "normal").trim().toLowerCase()
      const isSettlementLoan = normalizedLoanType === "top up" || normalizedLoanType === "buy off"

      const settlementRes = await client.query(
        `SELECT settlement_amount, settlement_status, disbursement_id
         FROM loan_settlements
         WHERE new_loan_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id],
      )
      const settlement = settlementRes.rows[0]
      const settlementCompleted =
        settlement &&
        ["complete", "completed"].includes(String(settlement.settlement_status || "").toLowerCase()) &&
        Boolean(settlement.disbursement_id)

      if (isSettlementLoan) {
        if (!settlement) return { error: "settlement_not_found" as const }
        if (!settlementCompleted) return { error: "settlement_not_completed" as const }
        if (currentStatus === "Approved") return { error: "settlement_not_completed" as const }
        if (disbursement_type === "partial" && currentStatus !== "Partially Disbursed") {
          return { error: "invalid_disbursement_status_for_partial" as const }
        }
        if (disbursement_type === "complete" && currentStatus !== "Partially Disbursed") {
          return { error: "invalid_disbursement_status_for_complete" as const }
        }
      } else if (disbursement_type === "partial") {
        if (currentStatus !== "Approved") {
          return { error: "invalid_disbursement_status_for_partial" as const }
        }
      } else if (currentStatus !== "Approved" && currentStatus !== "Partially Disbursed") {
        return { error: "invalid_disbursement_status_for_complete" as const }
      }

      if (Number.isNaN(transactionCharges) || transactionCharges < 0) {
        return { error: "invalid_transaction_charges" as const }
      }

      const modeValidation = validatePaymentModeInput({
        mode: disbursement_mode,
        referenceNumber: referenceNumberInput,
        bankAccountId: bankAccountIdInput,
      })
      if (modeValidation) return { error: modeValidation }

      let processingFeePercentage = 0
      if (loan.loan_product_id) {
        const feeRes = await client.query(
          `SELECT processing_fee_percentage
           FROM loan_products
           WHERE id = $1`,
          [loan.loan_product_id],
        )
        processingFeePercentage = Number(feeRes.rows[0]?.processing_fee_percentage || 0)
      }

      const settlementAmount = Number(settlement?.settlement_amount || 0)
      const disbursementCalc = calculateCompleteDisbursementAmount({
        principal: Number(loan.principal_amount || 0),
        processingFeePercentage,
        settlementAmount,
        loanType: loan.loan_type,
      })
      const completeDisbursementAmount = disbursementCalc.completeDisbursementAmount
      const defaultRemaining = Math.max(0, Number(completeDisbursementAmount || 0))
      const savedRemaining = Math.max(0, Number(loan.disbursement_balance || 0))
      const remainingBefore = currentStatus === "Partially Disbursed" ? savedRemaining : defaultRemaining

      if (remainingBefore <= 0) return { error: "no_remaining_disbursement_balance" as const }
      if (disbursement_amount === null || disbursement_amount <= 0) {
        return { error: "invalid_disbursement_amount" as const }
      }

      const roundedIncoming = round2(Number(disbursement_amount || 0))
      const roundedRemaining = round2(remainingBefore)

      let disbursementContext: {
        amount: number
        balanceBefore: number
        balanceAfter: number
        disbursementTypeLabel: string
        notes: string
      }

      const updates: Record<string, unknown> = { status: newStatus }

      if (disbursement_type === "partial") {
        if (roundedIncoming >= roundedRemaining) {
          return { error: "partial_amount_must_be_less_than_remaining_disbursable" as const }
        }
        const remainingAfter = round2(Math.max(roundedRemaining - roundedIncoming, 0))
        disbursementContext = {
          amount: roundedIncoming,
          balanceBefore: roundedRemaining,
          balanceAfter: remainingAfter,
          disbursementTypeLabel: "partial loan disburse",
          notes: disbursement_notes || "Partial loan disbursement",
        }
        updates.disbursement_balance = remainingAfter
      } else {
        if (roundedIncoming !== roundedRemaining) {
          return { error: "invalid_disbursement_amount" as const }
        }
        disbursementContext = {
          amount: roundedIncoming,
          balanceBefore: roundedRemaining,
          balanceAfter: 0,
          disbursementTypeLabel: "full loan disburse",
          notes: "Full loan disbursement",
        }
        updates.disbursement_balance = 0
      }

      updates.disbursement_date = disbursement_date

      if (newStatus === "Fully Disbursed") {
        const totalAmount = Number(loan.total_amount ?? 0)
        const principal = Number(loan.principal_amount ?? 0)
        const tenureMonths = Math.floor(Number(loan.tenure_months ?? 0))
        const rate = Number(loan.interest_rate ?? 0)
        let calcMethod: string = "reducing_balance"
        if (loan.loan_product_id) {
          const methodRes = await client.query(
            `SELECT interest_calculation_method FROM loan_products WHERE id = $1`,
            [loan.loan_product_id],
          )
          calcMethod = String(methodRes.rows[0]?.interest_calculation_method || "reducing_balance")
        }
        const initialOutstanding =
          totalAmount > 0
            ? totalAmount
            : tenureMonths > 0 && principal > 0
              ? calculateLoanTerms(principal, rate, tenureMonths, calcMethod).totalAmount
              : principal
        updates.outstanding_balance = initialOutstanding
      }

      let txCommitted = false
      await client.query("BEGIN")
      try {
        const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ")
        await client.query(`UPDATE loans SET ${setClause} WHERE id = $1`, [id, ...Object.values(updates)])

        if (newStatus === "Fully Disbursed") {
          const loanDetailRes = await client.query(
            `SELECT l.principal_amount, l.interest_rate, l.tenure_months, l.disbursement_date, lp.interest_calculation_method
             FROM loans l
             LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
             WHERE l.id = $1`,
            [id],
          )
          const loanDetail = loanDetailRes.rows[0]
          if (loanDetail && Number(loanDetail.tenure_months) > 0) {
            const principal = Number(loanDetail.principal_amount || 0)
            const annualRate = Number(loanDetail.interest_rate || 0)
            const tenureMonths = Math.floor(Number(loanDetail.tenure_months))
            const disbursementDateStr = toDateString(
              loanDetail.disbursement_date ?? new Date().toISOString().slice(0, 10),
            )
            const schedule = buildRepaymentSchedule({
              principal,
              annualRate,
              tenureMonths,
              method: loanDetail.interest_calculation_method,
              startDate: disbursementDateStr,
            })
            const firstDueDateStr = schedule[0]?.dueDate ?? null
            for (const row of schedule) {
              await client.query(
                `INSERT INTO loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_due, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
                 ON CONFLICT (loan_id, installment_number) DO NOTHING`,
                [id, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount, row.totalAmount],
              )
            }
            if (firstDueDateStr) {
              await client.query(`UPDATE loans SET next_payment_date = $1, updated_at = NOW() WHERE id = $2`, [
                firstDueDateStr,
                id,
              ])
            } else {
              await client.query(`UPDATE loans SET updated_at = NOW() WHERE id = $1`, [id])
            }
          } else {
            await client.query(`UPDATE loans SET updated_at = NOW() WHERE id = $1`, [id])
          }
        } else {
          await client.query(`UPDATE loans SET updated_at = NOW() WHERE id = $1`, [id])
        }

        const amount = Number(disbursementContext.amount || 0)
        const applicationId = String(loan.application_id || "").trim() || id.slice(0, 8)
        const disbursementDescription = isSettlementLoan
          ? `Member loan disbursement - ${applicationId}`
          : `Loan disbursement - ${applicationId}`

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: loan.branch_id,
            memberId: loan.member_id,
            loanId: id,
            bankAccountId: bankAccountIdInput || null,
            type: "Loan Disbursement",
            amount,
            mode: disbursement_mode,
            description: disbursementDescription,
            referenceNumber: referenceNumberInput || null,
            balanceBefore: Number(disbursementContext.balanceBefore || 0),
            balanceAfter: Number(disbursementContext.balanceAfter || 0),
            charges: transactionCharges > 0 ? transactionCharges : null,
            processedBy: actor.id,
            transactionDate: disbursement_date,
            prefix: "TXN",
          })

          await settlePaymentByMode(client, {
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            amount,
            charges: transactionCharges > 0 ? transactionCharges : null,
            mode: disbursement_mode,
            flow: "outflow",
            actor,
            bankAccountId: bankAccountIdInput || null,
            referenceNumber: referenceNumberInput,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            if (e.code === "insufficient_bank_balance") {
              return { error: "bank_account_insufficient_funds" as const }
            }
            return { error: e.code as typeof e.code }
          }
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "disbursement_transaction_create_failed" as const }
          }
          throw e
        }

        const transactionId = tx.id

        const disbInsertRes = await client.query(
          `INSERT INTO loan_disbursements
            (institution_id, branch_id, loan_id, disbursement_type, transaction_id, amount, disbursement_date, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            actor.institution_id,
            loan.branch_id,
            id,
            disbursementContext.disbursementTypeLabel,
            transactionId,
            amount,
            disbursement_date,
            disbursementContext.notes,
            actor.id,
          ],
        )
        const disbursementId = String(disbInsertRes.rows[0]?.id || "")
        if (disbursementId) {
          await auditLogger.logInsert(
            "loan_disbursements",
            disbursementId,
            {
              loan_id: id,
              disbursement_type: disbursementContext.disbursementTypeLabel,
              transaction_id: transactionId,
              amount,
              disbursement_date,
              notes: disbursementContext.notes,
            },
            actor.institution_id,
            actor.id,
            { branch_id: loanBranchId },
            client,
          )
        }

        if (transactionCharges > 0) {
          const applicationId = String(loan.application_id || "").trim() || id.slice(0, 8)
          const chargesExpenseDescription = `Loan disbursement charges for loan ${applicationId}`

          const chargesTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: loan.branch_id,
            bankAccountId: bankAccountIdInput || null,
            type: "Expense Payment",
            amount: transactionCharges,
            mode: disbursement_mode,
            description: chargesExpenseDescription,
            referenceNumber: referenceNumberInput || null,
            charges: null,
            processedBy: actor.id,
            transactionDate: disbursement_date,
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
              amount: transactionCharges,
              paymentMethod: disbursement_mode,
              description: "Loan disbursement charges",
              status: "Fully Paid",
              date: disbursement_date,
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
              amount: transactionCharges,
              paymentMethod: disbursement_mode,
              date: disbursement_date,
              createdBy: actor.id,
            },
            { actor, branchId: loanBranchId },
          )
        }

        const oldValues: Record<string, unknown> = {}
        Object.keys(updates).forEach((k) => {
          oldValues[k] = (loan as Record<string, unknown>)[k]
        })
        await auditLogger.logUpdate(
          "loans",
          id,
          oldValues,
          updates,
          actor.institution_id,
          actor.id,
          { branch_id: loanBranchId },
          client,
        )

        let postCommit: {
          actorId: string
          institutionId: string
          branchId: string
          institutionName: string
          currency: string
          newStatus: string
          member: { id: string; full_name: string; member_number: string; email: string }
          loan: {
            id: string
            application_id: string
            principal_amount: number
            loan_type: string
            product_name: string | null
          }
        } | null = null

        const ctxRes = await client.query(
          `SELECT
             l.application_id,
             l.principal_amount,
             l.loan_type,
             COALESCE(lp.product_name, '') AS product_name,
             m.id AS member_id,
             COALESCE(m.full_name, '') AS full_name,
             COALESCE(m.member_number, '') AS member_number,
             COALESCE(m.email, '') AS email
           FROM loans l
           LEFT JOIN members m ON m.id = l.member_id
           LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
           WHERE l.id = $1`,
          [id],
        )
        const ctxRow = ctxRes.rows[0] as Record<string, unknown> | undefined
        if (ctxRow?.member_id) {
          const cfgRes = await client.query<{ currency: string }>(
            `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [loanBranchId],
          )
          const instRes = await client.query<{ name: string }>(
            `SELECT name FROM institutions WHERE id = $1`,
            [actor.institution_id],
          )
          postCommit = {
            actorId: actor.id,
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            institutionName: instRes.rows[0]?.name || "",
            currency: (cfgRes.rows[0]?.currency as string) || "UGX",
            newStatus,
            member: {
              id: String(ctxRow.member_id),
              full_name: String(ctxRow.full_name || ""),
              member_number: String(ctxRow.member_number || ""),
              email: String(ctxRow.email || ""),
            },
            loan: {
              id,
              application_id: String(ctxRow.application_id || ""),
              principal_amount: Number(ctxRow.principal_amount || 0),
              loan_type: String(ctxRow.loan_type || "normal"),
              product_name: ctxRow.product_name ? String(ctxRow.product_name) : null,
            },
          }
        }

        await client.query("COMMIT")
        txCommitted = true
        return { ok: true, postCommit }
      } finally {
        if (!txCommitted) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "unknown_error")
      const status = loanWriteDenialStatus(errorCode)
      apiLog("warn", "loans.disburse.denied", {
        method: "POST",
        apiPath,
        status,
        error: errorCode,
        authUserId: session.user.authUserId,
        loanId: id,
      })
      return NextResponse.json(loanWriteDenialBody(result as { error: string; message?: string; staffStatus?: string; branchStatus?: string }), {
        status,
      })
    }

    apiLog("info", "loans.disburse.success", {
      method: "POST",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
      loanId: id,
    })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyLoanStatusChanged({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            loan: ctx.loan,
            newStatus: ctx.newStatus,
            currency: ctx.currency,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "loans.disburse.notifications_dispatched" : "loans.disburse.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 200,
            loanId: id,
            newStatus: ctx.newStatus,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "loans.disburse.notifications_failed", {
          method: "POST",
          apiPath,
          status: 200,
          loanId: id,
          newStatus: ctx.newStatus,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailRes = await enqueueLoanStatusEmails({
          actorId: ctx.actorId,
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          member: ctx.member,
          loan: ctx.loan,
          newStatus: ctx.newStatus,
          context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "loans.disburse.email_enqueue_partial", {
            method: "POST",
            apiPath,
            status: 200,
            loanId: id,
            newStatus: ctx.newStatus,
            errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "loans.disburse.email_enqueue_failed", {
          method: "POST",
          apiPath,
          status: 200,
          loanId: id,
          newStatus: ctx.newStatus,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.disburse.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
