import { NextResponse } from "next/server"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { applyPaymentToInstallments } from "@/lib/loans/apply-payment-to-installments"
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
  requireStaffSession,
  resolveActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { loanWriteDenialBody, loanWriteDenialStatus } from "@/lib/loans/write-denial"
import { enqueueLoanPaymentReceivedEmails } from "@/lib/email/loan-payment-emails"

type RepaymentRow = {
  id: string
  total_amount: string
  penalty_amount: string
  amount_due: string
  amount_paid: string
  status: string
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: loanId } = await params
    if (!loanId) {
      apiLog("warn", "loans.sell_off.denied", { method: "POST", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json(loanWriteDenialBody({ error: "missing_id" }), { status: 400 })
    }

    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "loans.sell_off.denied", { method: "POST", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const externalLenderId = String(body.external_lender_id || "").trim()
    const amount = Number(body.amount)
    const sellOffDate =
      typeof body.payment_date === "string" && body.payment_date.trim()
        ? body.payment_date.trim().slice(0, 10)
        : typeof body.sell_off_date === "string" && body.sell_off_date.trim()
          ? body.sell_off_date.trim().slice(0, 10)
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
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    if (!externalLenderId) {
      return NextResponse.json(loanWriteDenialBody({ error: "external_lender_id_required" }), { status: 400 })
    }
    if (!uuidRe.test(externalLenderId)) {
      return NextResponse.json(loanWriteDenialBody({ error: "invalid_external_lender_id" }), { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(loanWriteDenialBody({ error: "invalid_amount" }), { status: 400 })
    }

    const modeValidation = validatePaymentModeInput({
      mode,
      referenceNumber: referenceNumberInput,
      bankAccountId: bankAccountIdInput,
    })
    if (modeValidation) {
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

      const allowed = await hasPermission(client, actor, "sell_loan")
      if (!allowed) return { error: "missing_permission:sell_loan" as const }

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

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, application_id, status, outstanding_balance
         FROM loans
         WHERE id = $1`,
        [loanId],
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (String(loan.institution_id) !== String(actor.institution_id)) {
        return { error: "cross_tenant_operation_forbidden" as const }
      }
      if (!isSuperAdmin(actor) && String(loan.branch_id) !== String(actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }

      const institutionId = String(loan.institution_id)
      const loanBranchId = String(loan.branch_id || "")
      if (!loanBranchId) return { error: "loan_branch_missing" as const }

      const currentStatus = String(loan.status || "")
      if (currentStatus !== "Fully Disbursed" && currentStatus !== "Active") {
        return { error: "invalid_status_for_sell_off" as const }
      }

      const outstandingBalance = Number(loan.outstanding_balance || 0)
      const roundedProvided = round2(amount)
      const roundedOutstanding = round2(outstandingBalance)
      if (roundedProvided < roundedOutstanding) {
        return {
          error: "amount_below_outstanding_balance" as const,
          message: `Sell-off amount must be at least the full outstanding balance (${roundedOutstanding.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`,
        }
      }

      const settlementAmount = roundedOutstanding

      const extRes = await client.query(
        `SELECT id, name FROM third_party_agents WHERE id = $1 AND institution_id = $2 AND branch_id = $3`,
        [externalLenderId, loan.institution_id, loan.branch_id],
      )
      const externalLender = extRes.rows[0] as { id: string; name?: string } | undefined
      if (!externalLender) return { error: "external_lender_not_found" as const }

      let txCommitted = false
      await client.query("BEGIN")
      try {
        const repRes = await client.query(
          `SELECT id, total_amount, penalty_amount, amount_due, amount_paid, status
           FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC`,
          [loanId],
        )
        const rows = repRes.rows as RepaymentRow[]
        const { updates: paymentUpdates } = applyPaymentToInstallments(rows, settlementAmount)

        const installmentChanges: Array<{
          id: string
          old: { amount_paid: number; amount_due: number; status: string }
          next: { amount_paid: number; amount_due: number; status: string }
        }> = []

        for (const update of paymentUpdates) {
          const row = rows.find((r) => r.id === update.id)
          if (!row) continue
          await client.query(
            `UPDATE loan_repayments
             SET amount_paid = $1, amount_due = $2, payment_date = $3, status = $4, updated_at = NOW()
             WHERE id = $5`,
            [update.amount_paid, update.amount_due, sellOffDate, update.status, update.id],
          )
          installmentChanges.push({
            id: update.id,
            old: {
              amount_paid: Number(row.amount_paid || 0),
              amount_due: Number(row.amount_due || 0),
              status: String(row.status || "Pending"),
            },
            next: {
              amount_paid: update.amount_paid,
              amount_due: update.amount_due,
              status: update.status,
            },
          })
        }

        await client.query(
          `UPDATE loan_repayments
           SET status = 'Paid',
               amount_paid = total_amount + COALESCE(penalty_amount, 0),
               amount_due = 0,
               payment_date = COALESCE(payment_date, $2),
               updated_at = NOW()
           WHERE loan_id = $1 AND status != 'Paid'`,
          [loanId, sellOffDate],
        )

        const balanceBefore = roundedOutstanding
        const balanceAfter = 0

        try {
          await settlePaymentByMode(client, {
            institutionId,
            branchId: loanBranchId,
            amount: settlementAmount,
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
        const txDescription = `Loan sell-off - ${applicationId}`

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId,
            branchId: loan.branch_id,
            memberId: loan.member_id,
            loanId,
            bankAccountId: bankAccountIdInput || null,
            type: "Loan Repayment",
            amount: settlementAmount,
            mode,
            description: txDescription,
            referenceNumber: referenceNumberInput || null,
            balanceBefore,
            balanceAfter,
            processedBy: actor.id,
            transactionDate: sellOffDate,
            prefix: "TXN",
          })
        } catch (e: unknown) {
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "sell_off_transaction_create_failed" as const }
          }
          throw e
        }

        await client.query(
          `UPDATE loans
           SET status = 'Closed',
               outstanding_balance = 0,
               next_payment_date = NULL,
               remaining_tenure_months = 0,
               updated_at = NOW()
           WHERE id = $1`,
          [loanId],
        )

        const settlementInsertRes = await client.query(
          `INSERT INTO loan_settlements
            (institution_id, branch_id, disbursement_id, new_loan_id, settled_loan_id, external_lender_id, settlement_amount, settlement_type, settlement_status)
           VALUES
            ($1, $2, NULL, NULL, $3, $4, $5, 'external sell off', 'Completed')
           RETURNING id`,
          [loan.institution_id, loan.branch_id, loanId, externalLenderId, settlementAmount],
        )
        const settlementId = String(settlementInsertRes.rows[0]?.id || "")

        await auditLogger.logUpdate(
          "loans",
          loanId,
          { status: currentStatus, outstanding_balance: balanceBefore },
          {
            status: "Closed",
            outstanding_balance: balanceAfter,
            next_payment_date: null,
            remaining_tenure_months: 0,
            settlement_type: "external sell off",
            external_lender_id: externalLenderId,
          },
          institutionId,
          actor.id,
          { branch_id: loanBranchId },
          client,
        )

        if (installmentChanges.length > 0) {
          await auditLogger.logUpdate(
            "loan_repayments",
            loanId,
            {
              sell_off_amount: settlementAmount,
              mode,
              affected_installments: installmentChanges.map((c) => ({ id: c.id, ...c.old })),
            },
            {
              sell_off_date: sellOffDate,
              mode,
              affected_installments: installmentChanges.map((c) => ({ id: c.id, ...c.next })),
            },
            institutionId,
            actor.id,
            { branch_id: loanBranchId },
            client,
          )
        }

        if (settlementId) {
          await auditLogger.logInsert(
            "loan_settlements",
            settlementId,
            {
              settled_loan_id: loanId,
              external_lender_id: externalLenderId,
              settlement_amount: settlementAmount,
              settlement_type: "external sell off",
              settlement_status: "Completed",
            },
            institutionId,
            actor.id,
            { branch_id: loanBranchId },
            client,
          )
        }

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
            const [instRes, cfgRes] = await Promise.all([
              client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [institutionId]),
              client.query<{ currency: string }>(
                `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [loanBranchId],
              ),
            ])
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
                amount: settlementAmount,
                balance_after: balanceAfter,
                payment_date: sellOffDate,
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
          transaction_id: tx.id,
          settlement_id: settlementId || null,
          external_lender_name: String(externalLender.name || ""),
          postCommit,
        }
      } finally {
        if (!txCommitted) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const errorCode = typeof result.error === "string" ? result.error : "unknown_error"
      const status =
        errorCode === "external_lender_not_found" || errorCode === "not_found" ? 404 : loanWriteDenialStatus(errorCode)
      apiLog("warn", "loans.sell_off.denied", {
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
          : loanWriteDenialBody(result as { error: string; message?: string; staffStatus?: string; branchStatus?: string })
      return NextResponse.json(payload, { status })
    }

    apiLog("info", "loans.sell_off.success", {
      method: "POST",
      apiPath,
      status: 201,
      authUserId: sess.authUserId,
      loanId,
      transaction_id: result.transaction_id,
    })

    const ctx = result.postCommit
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
                sell_off: true,
              },
            },
            notifyClient,
          ),
        )
      } catch (notifyErr) {
        apiLog("warn", "loans.sell_off.notification_failed", {
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
          apiLog("warn", "loans.sell_off.email_enqueue_partial", {
            method: "POST",
            apiPath,
            loanId,
            errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "loans.sell_off.email_enqueue_failed", {
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
        transaction_id: result.transaction_id,
        settlement_id: result.settlement_id,
      },
      { status: 201 },
    )
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.sell_off.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
