import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { createExpense, createExpenseCashflow, createExpensePayment } from "@/lib/expenses/create-expense"
import { createTransaction } from "@/lib/transactions/create-transaction"

export interface RecordTransactionChargesExpenseParams {
  institutionId: string
  branchId: string
  actor: ActorContext & { branch_id: string }
  amount: number
  mode: string
  date: string
  expenseDescription: string
  cashflowDescription?: string
  referenceNumber?: string | null
  bankAccountId?: string | null
  /** Defaults to `actor.id` when no `thirdPartyAgentId` is set. */
  staffId?: string | null
  thirdPartyAgentId?: string | null
  saccoLoanId?: string | null
  loanId?: string | null
}

export interface RecordTransactionChargesExpenseResult {
  transactionId: string
  expenseId: string
  expenseCashflowId: string
}

/**
 * Record a completed transaction-charges expense chain:
 * Expense Payment transaction → expense → expense cashflow → expense payment.
 * Must run inside the caller's open DB transaction.
 */
export async function recordTransactionChargesExpense(
  client: PoolClient,
  params: RecordTransactionChargesExpenseParams,
): Promise<RecordTransactionChargesExpenseResult> {
  const {
    institutionId,
    branchId,
    actor,
    amount,
    mode,
    date,
    expenseDescription,
    cashflowDescription = "Transaction charges",
    referenceNumber = null,
    bankAccountId = null,
    staffId = null,
    thirdPartyAgentId = null,
    saccoLoanId = null,
    loanId = null,
  } = params

  const expensePartyStaffId = thirdPartyAgentId ? null : (staffId ?? actor.id)

  const chargesTx = await createTransaction(client, {
    institutionId,
    branchId,
    staffId: expensePartyStaffId,
    thirdPartyAgentId: thirdPartyAgentId || null,
    saccoLoanId,
    loanId,
    bankAccountId,
    type: "Expense Payment",
    amount,
    mode,
    description: expenseDescription,
    referenceNumber,
    charges: null,
    processedBy: actor.id,
    transactionDate: date,
    prefix: "TXN",
  })

  const expense = await createExpense(
    client,
    {
      institutionId,
      branchId,
      createdBy: actor.id,
      name: "Transaction charges",
      status: "Completed",
      type: "Operating-expenses",
      description: expenseDescription,
      completedBy: actor.id,
      completedAt: new Date(),
    },
    { actor, branchId },
  )

  const expenseCashflow = await createExpenseCashflow(
    client,
    {
      expenseId: expense.id,
      transactionId: chargesTx.id,
      amount,
      paymentMethod: mode,
      description: cashflowDescription,
      status: "Fully Paid",
      date,
      completedBy: actor.id,
      completedAt: new Date(),
    },
    { actor, branchId },
  )

  await createExpensePayment(
    client,
    {
      expenseId: expense.id,
      expenseCashflowId: expenseCashflow.id,
      transactionId: chargesTx.id,
      amount,
      paymentMethod: mode,
      date,
      createdBy: actor.id,
    },
    { actor, branchId },
  )

  return {
    transactionId: chargesTx.id,
    expenseId: expense.id,
    expenseCashflowId: expenseCashflow.id,
  }
}
