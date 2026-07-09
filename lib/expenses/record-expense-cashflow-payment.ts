import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { recordTransactionChargesExpense } from "@/lib/finances/record-transaction-charges-expense"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
} from "@/lib/finances/settle-payment-mode"
import {
  createExpenseCashflow,
  createExpensePayment,
  type CreatedExpenseCashflow,
  type CreatedExpensePayment,
} from "@/lib/expenses/create-expense"
import {
  EXPENSE_CASHFLOW_FULLY_PAID_STATUS,
  EXPENSE_CASHFLOW_PARTIALLY_PAID_STATUS,
  EXPENSE_CASHFLOW_UNPAID_STATUS,
  UNPAID_EXPENSE_CASHFLOW_MODE,
} from "@/lib/expenses/expense-cashflow-status"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { auditCashflowUpdate, cashflowSnapshot } from "@/lib/audit/expense-audit"
import { computeExpenseCashflowPaymentTotals } from "@/lib/expenses/expense-cashflow-payment-totals"

export type { ExpenseCashflowPaymentStatus } from "@/lib/expenses/expense-cashflow-status"
export {
  EXPENSE_CASHFLOW_FULLY_PAID_STATUS,
  EXPENSE_CASHFLOW_PARTIALLY_PAID_STATUS,
  EXPENSE_CASHFLOW_UNPAID_STATUS,
  UNPAID_EXPENSE_CASHFLOW_MODE,
  isEditableExpenseCashflowStatus,
  isExpenseCashflowPaymentRecordable,
  isExpenseCashflowUnpaidStatus,
  isSettledExpenseCashflowStatus,
  normalizeExpenseCashflowPaymentStatus,
} from "@/lib/expenses/expense-cashflow-status"

export interface RecordFullyPaidExpenseCashflowInput {
  client: PoolClient
  actor: ActorContext
  institutionId: string
  branchId: string
  expenseId: string
  expenseNumber: string
  staffId: string | null
  thirdPartyAgentId: string | null
  amount: number
  mode: string
  date: string
  description: string | null
  referenceNumber: string
  bankAccountId: string
  charges: number
}

export interface RecordFullyPaidExpenseCashflowResult {
  transactionId: string
  transactionNumber: string
  cashflow: CreatedExpenseCashflow
  expensePayment: CreatedExpensePayment
  chargesExpenseId?: string
  chargesTransactionId?: string
}

export interface RecordUnpaidExpenseCashflowInput {
  client: PoolClient
  actor: ActorContext
  institutionId: string
  branchId: string
  expenseId: string
  expenseNumber: string
  staffId: string | null
  thirdPartyAgentId: string | null
  amount: number
  date: string
  description: string | null
}

export interface RecordUnpaidExpenseCashflowResult {
  transactionId: string
  transactionNumber: string
  cashflow: CreatedExpenseCashflow
}

export function mapExpensePaymentSettlementFailure(error: PaymentSettlementFailure): string {
  if (error.code === "insufficient_bank_balance") return "bank_account_insufficient_funds"
  if (error.code === "insufficient_cash_balance") return "insufficient_cash_balance"
  if (error.code === "insufficient_mobile_money_balance") return "insufficient_mobile_money_balance"
  return error.code
}

const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100

export interface RecordExpenseCashflowSettlementPaymentInput {
  client: PoolClient
  actor: ActorContext
  institutionId: string
  branchId: string
  expenseId: string
  expenseNumber: string
  cashflowId: string
  staffId: string | null
  thirdPartyAgentId: string | null
  cashflowAmount: number
  paidSoFar: number
  paymentAmount: number
  mode: string
  date: string
  description: string | null
  referenceNumber: string
  bankAccountId: string
  charges: number
}

export interface RecordExpenseCashflowSettlementPaymentResult {
  transactionId: string
  transactionNumber: string
  expensePayment: CreatedExpensePayment
  paidAmount: number
  outstanding: number
  cashflowStatus: string
  chargesExpenseId?: string
  chargesTransactionId?: string
}

/**
 * Record a settlement payment against an existing expense cashflow:
 * 1. Principal Expense Payment transaction (balance_before / balance_after on obligation)
 * 2. expense_cashflows_payments row
 * 3. Branch finance settlement (outflow; includes charges when recorded)
 * 4. If charges > 0: charges transaction → charges expense → charges cashflow → payment
 * 5. Update cashflow status to Fully Paid or Part Paid
 */
export async function recordExpenseCashflowSettlementPayment(
  input: RecordExpenseCashflowSettlementPaymentInput,
): Promise<RecordExpenseCashflowSettlementPaymentResult> {
  const {
    client,
    actor,
    institutionId,
    branchId,
    expenseId,
    expenseNumber,
    cashflowId,
    staffId,
    thirdPartyAgentId,
    cashflowAmount,
    paidSoFar,
    paymentAmount,
    mode,
    date,
    description,
    referenceNumber,
    bankAccountId,
    charges,
  } = input

  const settlementCharges = charges > 0 ? charges : null
  const descTrim = description != null ? String(description).trim() : ""
  const txDescription = descTrim || `Expense payment - ${expenseNumber}`
  const dateStr = String(date || "").trim()
  const paymentDate = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
  const txDate =
    dateStr.length >= 10
      ? new Date(`${dateStr.slice(0, 10)}T12:00:00.000Z`).toISOString()
      : new Date().toISOString()

  const outstandingBefore = round2(Math.max(cashflowAmount - paidSoFar, 0))
  const balanceBefore = outstandingBefore
  const balanceAfter = round2(Math.max(outstandingBefore - paymentAmount, 0))
  const paidAmount = round2(paidSoFar + paymentAmount)
  const cashflowStatus =
    balanceAfter <= 0.01 ? EXPENSE_CASHFLOW_FULLY_PAID_STATUS : EXPENSE_CASHFLOW_PARTIALLY_PAID_STATUS

  const lockRes = await client.query(
    `SELECT id, expense_id, staff_id, third_party_agent_id, payment_method::text AS payment_method, amount,
            description, status, date::text AS date, transaction_id, completed_by, completed_at
     FROM expense_cashflows
     WHERE id = $1::uuid AND expense_id = $2::uuid
     FOR UPDATE`,
    [cashflowId, expenseId],
  )
  const cfRow = lockRes.rows[0] as Record<string, unknown> | undefined
  if (!cfRow) throw new Error("cashflow_not_found")
  const oldCashflow = cashflowSnapshot(cfRow)

  const tx = await createTransaction(client, {
    institutionId,
    branchId,
    thirdPartyAgentId,
    staffId,
    bankAccountId: bankAccountId || null,
    type: "Expense Payment",
    amount: paymentAmount,
    mode,
    description: txDescription,
    referenceNumber: referenceNumber || null,
    balanceBefore,
    balanceAfter,
    charges: settlementCharges,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
  })

  const expensePayment = await createExpensePayment(
    client,
    {
      expenseId,
      expenseCashflowId: cashflowId,
      transactionId: tx.id,
      amount: paymentAmount,
      paymentMethod: mode,
      date: paymentDate || null,
      createdBy: actor.id,
    },
    { actor, branchId },
  )

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount: paymentAmount,
    charges: settlementCharges,
    mode,
    flow: "outflow",
    actor,
    bankAccountId: bankAccountId || null,
    referenceNumber,
  })

  let chargesExpenseId: string | undefined
  let chargesTransactionId: string | undefined
  if (settlementCharges) {
    const chargesResult = await recordTransactionChargesExpense(client, {
      institutionId,
      branchId,
      actor: { ...actor, branch_id: branchId },
      amount: settlementCharges,
      mode,
      date: paymentDate || dateStr,
      expenseDescription: `Expense cashflow charges for ${expenseNumber}`,
      cashflowDescription: "Expense cashflow charges",
      referenceNumber: referenceNumber || null,
      bankAccountId: bankAccountId || null,
      thirdPartyAgentId,
    })
    chargesExpenseId = chargesResult.expenseId
    chargesTransactionId = chargesResult.transactionId
  }

  const upd = await client.query(
    `UPDATE expense_cashflows
     SET status = $1,
         payment_method = $2::payment_mode,
         completed_by = $3::uuid,
         completed_at = NOW()
     WHERE id = $4::uuid AND expense_id = $5::uuid
     RETURNING id, expense_id, staff_id, third_party_agent_id, payment_method::text AS payment_method, amount,
               description, status, date::text AS date, transaction_id, completed_by, completed_at`,
    [cashflowStatus, mode, actor.id, cashflowId, expenseId],
  )
  const out = upd.rows[0] as Record<string, unknown> | undefined
  if (!out) throw new Error("cashflow_update_failed")
  await auditCashflowUpdate(client, actor, cashflowId, oldCashflow, cashflowSnapshot(out), branchId)

  const totals = computeExpenseCashflowPaymentTotals(cashflowAmount, paidAmount)

  return {
    transactionId: tx.id,
    transactionNumber: tx.transactionNumber,
    expensePayment,
    paidAmount: totals.paid_amount,
    outstanding: totals.outstanding,
    cashflowStatus,
    chargesExpenseId,
    chargesTransactionId,
  }
}

/**
 * Fully paid expense cashflow on record:
 * 1. Principal Expense Payment transaction
 * 2. Expense cashflow (Fully Paid + transaction_id)
 * 3. Expense cashflows_payments row
 * 4. Branch finance settlement (outflow; includes charges when recorded)
 * 5. If charges > 0: charges transaction → charges expense → charges expense payment
 */
export async function recordFullyPaidExpenseCashflow(
  input: RecordFullyPaidExpenseCashflowInput,
): Promise<RecordFullyPaidExpenseCashflowResult> {
  const {
    client,
    actor,
    institutionId,
    branchId,
    expenseId,
    expenseNumber,
    staffId,
    thirdPartyAgentId,
    amount,
    mode,
    date,
    description,
    referenceNumber,
    bankAccountId,
    charges,
  } = input

  const settlementCharges = charges > 0 ? charges : null
  const descTrim = description != null ? String(description).trim() : ""
  const txDescription = descTrim || `Expense payment - ${expenseNumber}`
  const dateStr = String(date || "").trim()
  const paymentDate = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
  const txDate =
    dateStr.length >= 10
      ? new Date(`${dateStr.slice(0, 10)}T12:00:00.000Z`).toISOString()
      : new Date().toISOString()
  const completedAt = new Date()

  const tx = await createTransaction(client, {
    institutionId,
    branchId,
    thirdPartyAgentId,
    staffId,
    bankAccountId: bankAccountId || null,
    type: "Expense Payment",
    amount,
    mode,
    description: txDescription,
    referenceNumber: referenceNumber || null,
    charges: settlementCharges,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
  })

  const cashflow = await createExpenseCashflow(
    client,
    {
      expenseId,
      transactionId: tx.id,
      amount,
      date: paymentDate || null,
      staffId,
      thirdPartyAgentId,
      paymentMethod: mode,
      description,
      status: EXPENSE_CASHFLOW_FULLY_PAID_STATUS,
      completedBy: actor.id,
      completedAt,
    },
    { actor, branchId },
  )

  const expensePayment = await createExpensePayment(
    client,
    {
      expenseId,
      expenseCashflowId: cashflow.id,
      transactionId: tx.id,
      amount,
      paymentMethod: mode,
      date: paymentDate || null,
      createdBy: actor.id,
    },
    { actor, branchId },
  )

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount,
    charges: settlementCharges,
    mode,
    flow: "outflow",
    actor,
    bankAccountId: bankAccountId || null,
    referenceNumber,
  })

  let chargesExpenseId: string | undefined
  let chargesTransactionId: string | undefined
  if (settlementCharges) {
    const chargesResult = await recordTransactionChargesExpense(client, {
      institutionId,
      branchId,
      actor: { ...actor, branch_id: branchId },
      amount: settlementCharges,
      mode,
      date: paymentDate || dateStr,
      expenseDescription: `Expense cashflow charges for ${expenseNumber}`,
      cashflowDescription: "Expense cashflow charges",
      referenceNumber: referenceNumber || null,
      bankAccountId: bankAccountId || null,
      thirdPartyAgentId,
    })
    chargesExpenseId = chargesResult.expenseId
    chargesTransactionId = chargesResult.transactionId
  }

  return {
    transactionId: tx.id,
    transactionNumber: tx.transactionNumber,
    cashflow,
    expensePayment,
    chargesExpenseId,
    chargesTransactionId,
  }
}

/**
 * Unpaid expense cashflow on record:
 * 1. Expense Payment transaction (Bank Transfer; no bank account, charges, or reference)
 * 2. Unpaid expense cashflow linked to the transaction
 * No expense payment row and no branch finance settlement.
 */
export async function recordUnpaidExpenseCashflow(
  input: RecordUnpaidExpenseCashflowInput,
): Promise<RecordUnpaidExpenseCashflowResult> {
  const {
    client,
    actor,
    institutionId,
    branchId,
    expenseId,
    expenseNumber,
    staffId,
    thirdPartyAgentId,
    amount,
    date,
    description,
  } = input

  const descTrim = description != null ? String(description).trim() : ""
  const txDescription = descTrim || `Expense payment - ${expenseNumber}`
  const dateStr = String(date || "").trim()
  const paymentDate = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
  const txDate =
    dateStr.length >= 10
      ? new Date(`${dateStr.slice(0, 10)}T12:00:00.000Z`).toISOString()
      : new Date().toISOString()

  const tx = await createTransaction(client, {
    institutionId,
    branchId,
    thirdPartyAgentId,
    staffId,
    bankAccountId: null,
    type: "Expense Payment",
    amount,
    mode: UNPAID_EXPENSE_CASHFLOW_MODE,
    description: txDescription,
    referenceNumber: null,
    charges: null,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
  })

  const cashflow = await createExpenseCashflow(
    client,
    {
      expenseId,
      transactionId: tx.id,
      amount,
      date: paymentDate || null,
      staffId,
      thirdPartyAgentId,
      paymentMethod: UNPAID_EXPENSE_CASHFLOW_MODE,
      description,
      status: EXPENSE_CASHFLOW_UNPAID_STATUS,
    },
    { actor, branchId },
  )

  return {
    transactionId: tx.id,
    transactionNumber: tx.transactionNumber,
    cashflow,
  }
}
