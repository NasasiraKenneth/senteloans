import { NextResponse } from "next/server"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { applyPaymentToInstallments } from "@/lib/loans/apply-payment-to-installments"
import { buildRepaymentSchedule } from "@/lib/loans/calculations"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { createTransaction } from "@/lib/transactions/create-transaction"
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
  normalizeRole,
  requireStaffSession,
  resolveActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { loanWriteDenialBody, loanWriteDenialStatus } from "@/lib/loans/write-denial"
import { enqueueLoanPaymentReceivedEmails } from "@/lib/email/loan-payment-emails"

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

type RepaymentRow = {
  id: string
  installment_number: number
  due_date: string
  total_amount: string
  penalty_amount: string
  amount_due: string
  amount_paid: string
  status: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: loanId } = await params
    if (!loanId) {
      apiLog("warn", "loans.record_payment.invalid_request", {
        method: "POST",
        apiPath,
        status: 400,
        error: "missing_id",
      })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "loans.record_payment.denied", {
        method: "POST",
        apiPath,
        status: sess.status,
        error: sess.error,
        loanId,
      })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const amount = Number(body.amount)
    const payment_date =
      typeof body.payment_date === "string" && body.payment_date.trim()
        ? body.payment_date.trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    const mode = PAYMENT_MODES.includes(body.mode as (typeof PAYMENT_MODES)[number])
      ? (body.mode as string)
      : "Cash"
    const referenceNumberInput =
      typeof body.reference_number === "string"
        ? body.reference_number.trim()
        : typeof body.referenceNumber === "string"
          ? body.referenceNumber.trim()
          : ""
    const bankAccountIdInput = typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      apiLog("warn", "loans.record_payment.invalid_request", {
        method: "POST",
        apiPath,
        status: 400,
        error: "invalid_amount",
        loanId,
      })
      return NextResponse.json(loanWriteDenialBody({ error: "invalid_amount" }), { status: 400 })
    }

    const modeValidation = validatePaymentModeInput({
      mode,
      referenceNumber: referenceNumberInput,
      bankAccountId: bankAccountIdInput,
    })
    if (modeValidation) {
      apiLog("warn", "loans.record_payment.invalid_request", {
        method: "POST",
        apiPath,
        status: 400,
        error: modeValidation,
        loanId,
      })
      return NextResponse.json(loanWriteDenialBody({ error: modeValidation }), { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId, { activeOnly: false })
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

      const allowed = await hasPermission(client, actor, "record_payment")
      if (!allowed) return { error: "missing_permission:record_payment" as const }

      const isSystemAdmin = normalizeRole(actor.role) === "system_admin"
      if (!isSuperAdmin(actor) && !isSystemAdmin && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      if (!isSuperAdmin(actor) && !isSystemAdmin && actor.branch_id) {
        const branchCheck = await assertBranchActive(client, actor.branch_id)
        if (!branchCheck.ok) {
          return {
            error: branchCheck.error,
            branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
          }
        }
      }

      const loanRes = await client.query(
        `SELECT l.id, l.application_id, l.institution_id, l.branch_id, l.member_id, l.outstanding_balance, l.status, l.principal_amount, l.interest_rate, l.tenure_months, l.disbursement_date,
                lp.interest_calculation_method
         FROM loans l
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.id = $1`,
        [loanId],
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }

      const loanInstitutionId = String(loan.institution_id ?? "").trim().toLowerCase()
      const actorInstitutionId = String(actor.institution_id ?? "").trim().toLowerCase()

      if (!loanInstitutionId) return { error: "invalid_loan" as const }

      if (!isSystemAdmin && loanInstitutionId !== actorInstitutionId) {
        return {
          error: "cross_tenant_operation_forbidden" as const,
          message:
            "This loan belongs to another institution. Log in with that institution's staff account to record payments.",
        }
      }

      if (!isSuperAdmin(actor) && !isSystemAdmin && String(loan.branch_id) !== String(actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }

      const institutionId = isSystemAdmin ? loanInstitutionId : actorInstitutionId
      const loanBranchId = String(loan.branch_id || "")
      if (!loanBranchId) return { error: "loan_branch_missing" as const }

      const status = String(loan.status)
      if (status !== "Fully Disbursed" && status !== "Partially Disbursed" && status !== "Active") {
        return { error: "loan_not_eligible_for_payment" as const }
      }

      let txCommitted = false
      await client.query("BEGIN")
      try {
        let repRes = await client.query(
          `SELECT id, installment_number, due_date, total_amount, penalty_amount, amount_due, amount_paid, status
           FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC`,
          [loanId],
        )
        let rows = repRes.rows as RepaymentRow[]

        if (rows.length === 0) {
          const anyRepRes = await client.query(`SELECT 1 FROM loan_repayments WHERE loan_id = $1 LIMIT 1`, [loanId])
          if (anyRepRes.rows.length === 0) {
            const principal = Number(loan.principal_amount ?? 0)
            const annualRate = Number(loan.interest_rate ?? 0)
            const tenureMonths = Math.floor(Number(loan.tenure_months ?? 0))
            const disbursementDateStr = toDateString(loan.disbursement_date ?? new Date().toISOString().slice(0, 10))
            if (tenureMonths > 0 && principal > 0) {
              const schedule = buildRepaymentSchedule({
                principal,
                annualRate,
                tenureMonths,
                method: loan.interest_calculation_method,
                startDate: disbursementDateStr,
              })
              for (const row of schedule) {
                await client.query(
                  `INSERT INTO loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_due, status)
                   VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
                   ON CONFLICT (loan_id, installment_number) DO NOTHING`,
                  [loanId, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount, row.totalAmount],
                )
              }
              const currentOutstanding = Number(loan.outstanding_balance || 0)
              if (currentOutstanding <= 0) {
                const sumRes = await client.query(
                  `SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM loan_repayments WHERE loan_id = $1`,
                  [loanId],
                )
                const scheduleTotal = Number(sumRes.rows[0]?.total ?? 0)
                if (scheduleTotal > 0) {
                  await client.query(`UPDATE loans SET outstanding_balance = $1, updated_at = NOW() WHERE id = $2`, [
                    scheduleTotal,
                    loanId,
                  ])
                  loan.outstanding_balance = scheduleTotal
                }
              }
              repRes = await client.query(
                `SELECT id, installment_number, due_date, total_amount, penalty_amount, amount_due, amount_paid, status
                 FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC`,
                [loanId],
              )
              rows = repRes.rows as RepaymentRow[]
            }
          }
        }

        if (rows.length === 0) {
          return {
            error: "no_unpaid_installments" as const,
            message:
              "No unpaid installments. The repayment schedule may be missing (loan may have no tenure or disbursement date) or all installments are already paid.",
          }
        }

        const { updates: paymentUpdates, totalApplied } = applyPaymentToInstallments(rows, amount)
        const installmentChanges: Array<{
          id: string
          old: { amount_paid: number; amount_due: number; status: string; payment_date: string | null }
          next: { amount_paid: number; amount_due: number; status: string; payment_date: string }
        }> = []

        for (const update of paymentUpdates) {
          const row = rows.find((r) => r.id === update.id)
          if (!row) continue
          const paid = Number(row.amount_paid || 0)
          await client.query(
            `UPDATE loan_repayments
             SET amount_paid = $1, amount_due = $2, payment_date = $3, status = $4, updated_at = NOW()
             WHERE id = $5`,
            [update.amount_paid, update.amount_due, payment_date, update.status, update.id],
          )
          installmentChanges.push({
            id: update.id,
            old: {
              amount_paid: paid,
              amount_due: Number(row.amount_due || 0),
              status: String(row.status || "Pending"),
              payment_date: null,
            },
            next: {
              amount_paid: update.amount_paid,
              amount_due: update.amount_due,
              status: update.status,
              payment_date,
            },
          })
        }

        if (totalApplied <= 0) return { error: "amount_exceeds_due" as const }

        const balanceBefore = Number(loan.outstanding_balance || 0)
        const balanceAfter = Math.max(0, balanceBefore - totalApplied)

        const nextStatus =
          balanceAfter <= 0
            ? "Closed"
            : String(loan.status) === "Fully Disbursed" || String(loan.status) === "Partially Disbursed"
              ? "Active"
              : String(loan.status)

        try {
          await settlePaymentByMode(client, {
            institutionId,
            branchId: loanBranchId,
            amount: totalApplied,
            mode,
            flow: "inflow",
            actor,
            bankAccountId: bankAccountIdInput || null,
            referenceNumber: referenceNumberInput,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            return { error: e.code as typeof e.code }
          }
          throw e
        }

        const applicationId = String(loan.application_id || "").trim() || loanId.slice(0, 8)
        const paymentDescription = `Loan payment - ${applicationId}`

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId,
            branchId: loan.branch_id,
            memberId: loan.member_id,
            loanId,
            bankAccountId: bankAccountIdInput || null,
            type: "Loan Repayment",
            amount: totalApplied,
            mode,
            description: paymentDescription,
            referenceNumber: referenceNumberInput || null,
            balanceBefore,
            balanceAfter,
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

        await client.query(`UPDATE loans SET outstanding_balance = $1, status = $2, updated_at = NOW() WHERE id = $3`, [
          balanceAfter,
          nextStatus,
          loanId,
        ])

        const nextRes = await client.query(
          `SELECT due_date FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC LIMIT 1`,
          [loanId],
        )
        const nextDue = nextRes.rows[0]?.due_date ?? null
        const remainingRes = await client.query(
          `SELECT COUNT(*)::int AS remaining_installments FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid'`,
          [loanId],
        )
        const remainingInstallments = Number(remainingRes.rows[0]?.remaining_installments ?? 0)

        let finalStatus = nextStatus
        if (nextDue !== null) {
          await client.query(
            `UPDATE loans SET next_payment_date = $1, remaining_tenure_months = $2, updated_at = NOW() WHERE id = $3`,
            [nextDue, remainingInstallments, loanId],
          )
        } else {
          await client.query(
            `UPDATE loans SET next_payment_date = NULL, remaining_tenure_months = 0, updated_at = NOW() WHERE id = $1`,
            [loanId],
          )
          await client.query(`UPDATE loans SET status = 'Closed', updated_at = NOW() WHERE id = $1`, [loanId])
          finalStatus = "Closed"
        }

        await auditLogger.logUpdate(
          "loans",
          loanId,
          {
            outstanding_balance: balanceBefore,
            status: String(loan.status || ""),
          },
          {
            outstanding_balance: balanceAfter,
            status: finalStatus,
            next_payment_date: nextDue ?? null,
            remaining_tenure_months: nextDue !== null ? remainingInstallments : 0,
          },
          institutionId,
          actor.id,
          { branch_id: loanBranchId },
          client,
        )

        await auditLogger.logUpdate(
          "loan_repayments",
          loanId,
          {
            total_payment: amount,
            mode,
            affected_installments: installmentChanges.map((c) => ({ id: c.id, ...c.old })),
          },
          {
            total_applied: totalApplied,
            payment_date,
            mode,
            affected_installments: installmentChanges.map((c) => ({ id: c.id, ...c.next })),
          },
          institutionId,
          actor.id,
          { branch_id: loanBranchId },
          client,
        )

        await client.query("COMMIT")
        txCommitted = true

        let postCommit: {
          actorId: string
          institutionId: string
          branchId: string
          institutionName: string
          currency: string
          member: { id: string; full_name: string; member_number: string; email: string }
          loan: { id: string; application_id: string }
          payment: { amount: number; balance_after: number; payment_date: string }
          transaction: { id: string; transaction_number: string }
        } | null = null

        if (loan.member_id) {
          const ctxRes = await client.query(
            `SELECT
               COALESCE(m.full_name, '') AS full_name,
               COALESCE(m.member_number, '') AS member_number,
               COALESCE(m.email, '') AS email
             FROM members m
             WHERE m.id = $1`,
            [loan.member_id],
          )
          const ctxRow = ctxRes.rows[0] as Record<string, unknown> | undefined
          if (ctxRow) {
            const instRes = await client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [institutionId])
            const cfgRes = await client.query<{ currency: string }>(
              `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
              [loanBranchId],
            )
            postCommit = {
              actorId: actor.id,
              institutionId,
              branchId: loanBranchId,
              institutionName: instRes.rows[0]?.name || "",
              currency: (cfgRes.rows[0]?.currency as string) || "UGX",
              member: {
                id: String(loan.member_id),
                full_name: String(ctxRow.full_name || ""),
                member_number: String(ctxRow.member_number || ""),
                email: String(ctxRow.email || ""),
              },
              loan: {
                id: loanId,
                application_id: applicationId,
              },
              payment: {
                amount: totalApplied,
                balance_after: balanceAfter,
                payment_date,
              },
              transaction: {
                id: tx.id,
                transaction_number: tx.transactionNumber,
              },
            }
          }
        }

        return {
          ok: true as const,
          amount_applied: totalApplied,
          balance_after: balanceAfter,
          transaction_id: tx.id,
          postCommit,
        }
      } finally {
        if (!txCommitted) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "unknown_error")
      const status = errorCode === "not_found" ? 404 : loanWriteDenialStatus(errorCode)
      apiLog("warn", "loans.record_payment.denied", {
        method: "POST",
        apiPath,
        status,
        error: errorCode,
        authUserId: sess.authUserId,
        loanId,
      })
      const payload =
        "message" in result && typeof result.message === "string"
          ? loanWriteDenialBody({ ...result, error: errorCode, message: result.message })
          : loanWriteDenialBody(result as { error: string; staffStatus?: string; branchStatus?: string })
      return NextResponse.json(payload, { status })
    }

    apiLog("info", "loans.record_payment.success", {
      method: "POST",
      apiPath,
      status: 201,
      authUserId: sess.authUserId,
      loanId,
      amount_applied: result.amount_applied,
    })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const tpl = NotificationTemplates.paymentReceived(loanId, ctx.payment.amount)
        await runWithoutAuth((notifyClient) =>
          notificationService.create(
            {
              institutionId: ctx.institutionId,
              branchId: ctx.branchId,
              recipientType: "member",
              recipientId: ctx.member.id,
              type: "payment_received",
              title: tpl.title,
              message: tpl.message,
              actionUrl: tpl.actionUrl,
              metadata: {
                loan_id: loanId,
                amount: ctx.payment.amount,
                balance_after: ctx.payment.balance_after,
                payment_date: ctx.payment.payment_date,
              },
            },
            notifyClient,
          ),
        )
      } catch (notifyErr) {
        apiLog("warn", "loans.record_payment.notification_failed", {
          method: "POST",
          apiPath,
          loanId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailRes = await enqueueLoanPaymentReceivedEmails({
          member: ctx.member,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          loan: ctx.loan,
          payment: ctx.payment,
          transaction: ctx.transaction,
          context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "loans.record_payment.email_enqueue_partial", {
            method: "POST",
            apiPath,
            loanId,
            errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "loans.record_payment.email_enqueue_failed", {
          method: "POST",
          apiPath,
          loanId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json(
      {
        ok: result.ok,
        amount_applied: result.amount_applied,
        balance_after: result.balance_after,
        transaction_id: result.transaction_id,
      },
      { status: 201 },
    )
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.record_payment.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
