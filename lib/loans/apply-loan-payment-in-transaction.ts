import type { PoolClient } from "pg"
import { applyPaymentToInstallments } from "@/lib/loans/apply-payment-to-installments"
import { auditLogger } from "@/lib/audit/audit-logger"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { PaymentSettlementFailure, settlePaymentByMode } from "@/lib/finances/settle-payment-mode"

type RepaymentRow = {
  id: string
  total_amount: string
  penalty_amount: string
  amount_due: string
  amount_paid: string
  status: string
}

export type ApplyLoanPaymentInput = {
  loanId: string
  institutionId: string
  branchId: string
  memberId: string | null
  applicationId: string
  amount: number
  paymentDate: string
  mode: string
  actorId: string
  referenceNumber?: string | null
  bankAccountId?: string | null
  description?: string
  auditMeta?: { branch_id: string }
  /** When true, only updates schedule/loan balances — no branch finance settlement. */
  skipFinanceSettlement?: boolean
  /** When true, closes the loan to zero balance (e.g. top-up settlement payoff). */
  forceFullClose?: boolean
}

export type ApplyLoanPaymentResult =
  | { ok: true; transactionId: string; amountApplied: number; balanceAfter: number }
  | { error: string }

/**
 * Apply a loan repayment inside the caller's open transaction (no BEGIN/COMMIT).
 */
export async function applyLoanPaymentInTransaction(
  client: PoolClient,
  input: ApplyLoanPaymentInput,
): Promise<ApplyLoanPaymentResult> {
  const loanRes = await client.query(
    `SELECT id, outstanding_balance, status
     FROM loans
     WHERE id = $1`,
    [input.loanId],
  )
  const loan = loanRes.rows[0]
  if (!loan) return { error: "not_found" }

  const status = String(loan.status || "")
  if (status !== "Fully Disbursed" && status !== "Partially Disbursed" && status !== "Active") {
    return { error: "loan_not_eligible_for_payment" }
  }

  const repRes = await client.query(
    `SELECT id, total_amount, penalty_amount, amount_due, amount_paid, status
     FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC`,
    [input.loanId],
  )
  const rows = repRes.rows as RepaymentRow[]

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { error: "invalid_amount" }

  let totalApplied = 0
  if (rows.length > 0) {
    const { updates: paymentUpdates, totalApplied: applied } = applyPaymentToInstallments(rows, amount)
    totalApplied = applied
    for (const update of paymentUpdates) {
      await client.query(
        `UPDATE loan_repayments
         SET amount_paid = $1, amount_due = $2, payment_date = $3, status = $4, updated_at = NOW()
         WHERE id = $5`,
        [update.amount_paid, update.amount_due, input.paymentDate, update.status, update.id],
      )
    }
    await client.query(
      `UPDATE loan_repayments
       SET status = 'Paid',
           amount_paid = total_amount + COALESCE(penalty_amount, 0),
           amount_due = 0,
           payment_date = COALESCE(payment_date, $2),
           updated_at = NOW()
       WHERE loan_id = $1 AND status != 'Paid'`,
      [input.loanId, input.paymentDate],
    )
  } else {
    totalApplied = amount
  }

  if (totalApplied <= 0 && rows.length > 0) return { error: "amount_exceeds_due" }

  const balanceBefore = Number(loan.outstanding_balance || 0)
  if (input.forceFullClose) {
    totalApplied = balanceBefore
  }
  const balanceAfter = input.forceFullClose ? 0 : Math.max(0, balanceBefore - totalApplied)

  if (!input.skipFinanceSettlement) {
    try {
      await settlePaymentByMode(client, {
        institutionId: input.institutionId,
        branchId: input.branchId,
        amount: totalApplied,
        mode: input.mode,
        flow: "inflow",
        actor: {
          id: input.actorId,
          institution_id: input.institutionId,
          branch_id: input.branchId,
        },
        bankAccountId: input.bankAccountId || null,
        referenceNumber: input.referenceNumber,
      })
    } catch (e: unknown) {
      if (e instanceof PaymentSettlementFailure) return { error: e.code }
      throw e
    }
  }

  const paymentDescription =
    input.description || `Loan payment - ${input.applicationId}`

  let tx
  try {
    tx = await createTransaction(client, {
      institutionId: input.institutionId,
      branchId: input.branchId,
      memberId: input.memberId,
      loanId: input.loanId,
      bankAccountId: input.bankAccountId || null,
      type: "Loan Repayment",
      amount: totalApplied,
      mode: input.mode,
      description: paymentDescription,
      referenceNumber: input.referenceNumber || null,
      balanceBefore,
      balanceAfter,
      processedBy: input.actorId,
      transactionDate: input.paymentDate,
      prefix: "TXN",
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || ""
    if (msg === "transaction_insert_failed") return { error: "repayment_transaction_create_failed" }
    throw e
  }

  const finalStatus = balanceAfter <= 0 ? "Closed" : status === "Fully Disbursed" || status === "Partially Disbursed" ? "Active" : status

  await client.query(
    `UPDATE loans SET outstanding_balance = $1, status = $2, updated_at = NOW() WHERE id = $3`,
    [balanceAfter, finalStatus, input.loanId],
  )

  if (balanceAfter <= 0) {
    await client.query(
      `UPDATE loans SET next_payment_date = NULL, remaining_tenure_months = 0, updated_at = NOW() WHERE id = $1`,
      [input.loanId],
    )
  } else {
    const nextRes = await client.query(
      `SELECT due_date FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC LIMIT 1`,
      [input.loanId],
    )
    const nextDue = nextRes.rows[0]?.due_date ?? null
    const remainingRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid'`,
      [input.loanId],
    )
    const remainingInstallments = Number(remainingRes.rows[0]?.count || 0)
    await client.query(
      `UPDATE loans SET next_payment_date = $1, remaining_tenure_months = $2, updated_at = NOW() WHERE id = $3`,
      [nextDue, remainingInstallments, input.loanId],
    )
  }

  await auditLogger.logUpdate(
    "loans",
    input.loanId,
    { outstanding_balance: balanceBefore, status },
    { outstanding_balance: balanceAfter, status: finalStatus },
    input.institutionId,
    input.actorId,
    input.auditMeta,
    client,
  )

  return { ok: true, transactionId: tx.id, amountApplied: totalApplied, balanceAfter }
}
