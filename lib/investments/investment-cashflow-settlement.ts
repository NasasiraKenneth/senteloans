import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { recordTransactionChargesExpense } from "@/lib/finances/record-transaction-charges-expense"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  type PaymentFlow,
} from "@/lib/finances/settle-payment-mode"
import { createTransaction } from "@/lib/transactions/create-transaction"

export type InvestmentCashflowDirection = "inflow" | "outflow"
export type InvestmentCashflowCategory = "capital" | "income" | "expense"

/**
 * Branch float direction for settlePaymentByMode — independent of cashflow type label.
 *
 * - income (inflow) and capital outflow → branch receives money (inflow)
 * - capital inflow and expense outflow → branch pays out (outflow)
 */
export function resolveInvestmentCashflowSettlementFlow(
  type: InvestmentCashflowDirection,
  category: InvestmentCashflowCategory,
): PaymentFlow {
  if (type === "inflow" && category === "expense") {
    throw new Error(`unsupported_investment_cashflow_settlement:${type}:${category}`)
  }
  if (type === "outflow" && category === "income") {
    throw new Error(`unsupported_investment_cashflow_settlement:${type}:${category}`)
  }
  if (category === "income") return "inflow"
  if (category === "capital" && type === "outflow") return "inflow"
  if (category === "capital" && type === "inflow") return "outflow"
  if (category === "expense" && type === "outflow") return "outflow"
  throw new Error(`unsupported_investment_cashflow_settlement:${type}:${category}`)
}

/**
 * Ledger transaction type for investment cashflows.
 *
 * - Investment Deposit: capital deployed or expense paid into the investment
 * - Investment Withdrawal: income received or capital returned from the investment
 */
export function resolveInvestmentCashflowTransactionType(
  type: InvestmentCashflowDirection,
  category: InvestmentCashflowCategory,
): "Investment Deposit" | "Investment Withdrawal" {
  if (type === "inflow" && category === "expense") {
    throw new Error(`unsupported_investment_cashflow_transaction:${type}:${category}`)
  }
  if (type === "outflow" && category === "income") {
    throw new Error(`unsupported_investment_cashflow_transaction:${type}:${category}`)
  }
  if (category === "income") return "Investment Withdrawal"
  if (category === "capital" && type === "outflow") return "Investment Withdrawal"
  if (category === "capital" && type === "inflow") return "Investment Deposit"
  if (category === "expense" && type === "outflow") return "Investment Deposit"
  throw new Error(`unsupported_investment_cashflow_transaction:${type}:${category}`)
}

export interface InvestmentCashflowPaymentContext {
  id: string
  institution_id: string
  branch_id: string
  provider_id: string | null
  investment_number: string | null
}

export interface RecordInvestmentCashflowPaymentInput {
  client: PoolClient
  actor: ActorContext & { branch_id: string }
  investment: InvestmentCashflowPaymentContext
  type: InvestmentCashflowDirection
  category: InvestmentCashflowCategory
  amount: number
  charges: number
  mode: string
  date: string
  description: string | null
  referenceNumber: string
  bankAccountId: string
}

export interface RecordInvestmentCashflowPaymentResult {
  transactionId: string
  chargesExpenseId?: string
}

/**
 * Settle branch finances, write the principal ledger transaction, and optionally
 * record the transaction-charges expense chain.
 */
export async function recordInvestmentCashflowPayment(
  input: RecordInvestmentCashflowPaymentInput,
): Promise<RecordInvestmentCashflowPaymentResult> {
  const {
    client,
    actor,
    investment,
    type,
    category,
    amount,
    charges,
    mode,
    date,
    description,
    referenceNumber,
    bankAccountId,
  } = input

  const settlementFlow = resolveInvestmentCashflowSettlementFlow(type, category)
  const settlementCharges = charges > 0 ? charges : null
  const investmentLabel = String(investment.investment_number || investment.id).trim()
  const txDesc = description || `Investment cashflow (${investmentLabel})`
  const txType = resolveInvestmentCashflowTransactionType(type, category)

  await settlePaymentByMode(client, {
    institutionId: actor.institution_id,
    branchId: investment.branch_id,
    amount,
    charges: settlementCharges,
    mode,
    flow: settlementFlow,
    actor,
    bankAccountId: bankAccountId || null,
    referenceNumber,
  })

  const tx = await createTransaction(client, {
    institutionId: investment.institution_id,
    branchId: investment.branch_id,
    thirdPartyAgentId: investment.provider_id,
    bankAccountId: bankAccountId || null,
    type: txType,
    amount,
    mode,
    description: txDesc,
    referenceNumber: referenceNumber || null,
    charges: settlementCharges,
    processedBy: actor.id,
    transactionDate: date,
    prefix: "TXN",
  })

  let chargesExpenseId: string | undefined
  if (settlementCharges) {
    const chargesResult = await recordTransactionChargesExpense(client, {
      institutionId: investment.institution_id,
      branchId: investment.branch_id,
      actor,
      amount: settlementCharges,
      mode,
      date,
      expenseDescription: `Investment cashflow charges for ${investmentLabel}`,
      cashflowDescription: "Investment cashflow charges",
      referenceNumber: referenceNumber || null,
      bankAccountId: bankAccountId || null,
      thirdPartyAgentId: investment.provider_id,
    })
    chargesExpenseId = chargesResult.expenseId
  }

  return { transactionId: tx.id, chargesExpenseId }
}

export function mapPaymentSettlementFailure(error: PaymentSettlementFailure): string {
  if (error.code === "insufficient_bank_balance") return "bank_account_insufficient_funds"
  return error.code
}
