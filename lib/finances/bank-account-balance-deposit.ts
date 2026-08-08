import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { getBranchBankAccount } from "@/lib/finances/bank-account"
import { getDailyFinanceChannelBalance } from "@/lib/finances/daily-finance"
import { recordTransactionChargesExpense } from "@/lib/finances/record-transaction-charges-expense"
import { isBankRoutedPaymentMode, normalizePaymentMode } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { createTransaction } from "@/lib/transactions/create-transaction"

export const IN_SACCO_TRANSFER_TRANSACTION_TYPE = "In Sacco Transfer"

export type BankAccountDepositTarget = {
  id: string
  branch_id: string
  third_party_agent_id: string
  bank_name: string
  bank_account_number: string
}

export interface RecordBankAccountDepositInput {
  client: PoolClient
  actor: ActorContext & { branch_id: string }
  targetAccount: BankAccountDepositTarget
  amount: number
  charges: number
  /** Transfer-from mode (Cash, Mobile Money, Bank Transfer, …). */
  sourceMode: string
  date: string
  /** Reference for crediting the target bank (below-amount field). */
  inflowReferenceNumber: string
  /** Reference for source outflow and charges (non-cash mode field). */
  sourceReferenceNumber?: string | null
  /** Source bank account when `sourceMode` is bank-routed (not the target). */
  sourceBankAccountId?: string | null
}

export interface RecordBankAccountDepositResult {
  transactionId: string
  transactionNumber: string
  totalAmount: number
  chargesExpenseId?: string
  chargesTransactionId?: string
}

export function mapBankAccountDepositSettlementError(code: PaymentSettlementFailure["code"]): string {
  switch (code) {
    case "insufficient_bank_balance":
      return "insufficient_bank_balance"
    case "insufficient_cash_balance":
      return "insufficient_cash_balance"
    case "insufficient_mobile_money_balance":
      return "insufficient_mobile_money_balance"
    case "invalid_mode":
      return "invalid_mode"
    case "reference_number_required":
      return "reference_number_required"
    case "bank_account_required":
      return "bank_account_required"
    case "invalid_settlement_amount":
      return "invalid_amount"
    case "bank_account_not_found":
      return "bank_account_not_found"
    default:
      return code
  }
}

function bankLabel(accountNumber: string): string {
  const n = String(accountNumber || "").trim()
  return n ? `Bank ${n}` : "Bank"
}

/** Human-readable source label for transfer descriptions. */
export async function resolveTransferSourceLabel(
  client: PoolClient,
  params: {
    institutionId: string
    branchId: string
    sourceMode: string
    sourceBankAccountId?: string | null
  },
): Promise<string> {
  const mode = normalizePaymentMode(params.sourceMode)
  if (!mode) return String(params.sourceMode || "").trim() || "Unknown"
  if (mode === "Cash") return "Cash"
  if (mode === "Mobile Money") return "Mobile Money"

  if (isBankRoutedPaymentMode(mode)) {
    const sourceId = String(params.sourceBankAccountId || "").trim()
    if (!sourceId) return "Bank"
    const row = await getBranchBankAccount(client, {
      bankAccountId: sourceId,
      institutionId: params.institutionId,
      branchId: params.branchId,
    })
    return bankLabel(String(row?.bank_account_number || ""))
  }

  return mode
}

export function buildInSaccoTransferDescription(
  sourceLabel: string,
  targetAccountNumber: string,
): string {
  const targetLabel = bankLabel(targetAccountNumber)
  return `In Sacco Transfer from ${sourceLabel} to ${targetLabel}`
}

async function readSourceChannelBalance(
  client: PoolClient,
  params: {
    institutionId: string
    branchId: string
    mode: string
    sourceBankAccountId?: string | null
  },
): Promise<number> {
  if (isBankRoutedPaymentMode(params.mode)) {
    const sourceId = String(params.sourceBankAccountId || "").trim()
    const row = await getBranchBankAccount(client, {
      bankAccountId: sourceId,
      institutionId: params.institutionId,
      branchId: params.branchId,
    })
    if (!row) throw new PaymentSettlementFailure("bank_account_not_found")
    return Number(row.total_amount ?? 0)
  }

  const { balance } = await getDailyFinanceChannelBalance(client, {
    institutionId: params.institutionId,
    branchId: params.branchId,
    mode: params.mode,
  })
  return balance
}

/**
 * Deposit into a bank account (target): debit transfer-from float/source bank,
 * optional charges expense chain, ledger transfer rows, credit target bank.
 * Must run inside the caller's open DB transaction.
 */
export async function recordBankAccountDeposit(
  input: RecordBankAccountDepositInput,
): Promise<RecordBankAccountDepositResult> {
  const {
    client,
    actor,
    targetAccount,
    amount,
    charges,
    sourceMode,
    date,
    inflowReferenceNumber,
    sourceReferenceNumber = null,
    sourceBankAccountId = null,
  } = input

  const institutionId = actor.institution_id
  const branchId = String(targetAccount.branch_id)
  const mode = normalizePaymentMode(sourceMode)
  if (!mode) throw new PaymentSettlementFailure("invalid_mode")

  const inflowRef = String(inflowReferenceNumber || "").trim()
  if (!inflowRef) throw new PaymentSettlementFailure("reference_number_required")

  const sourceRef =
    mode === "Cash"
      ? inflowRef
      : String(sourceReferenceNumber || "").trim() || null

  const modeValidation = validatePaymentModeInput({
    mode,
    referenceNumber: sourceRef,
    bankAccountId: isBankRoutedPaymentMode(mode) ? sourceBankAccountId : null,
  })
  if (modeValidation) throw new PaymentSettlementFailure(modeValidation)

  if (isBankRoutedPaymentMode(mode)) {
    const sourceId = String(sourceBankAccountId || "").trim()
    if (sourceId === targetAccount.id) {
      throw new PaymentSettlementFailure("invalid_settlement_amount")
    }
  }

  const dateOnly = toDateOnlyString(date)
  if (!dateOnly) throw new PaymentSettlementFailure("invalid_settlement_amount")

  const settlementCharges = charges > 0 ? charges : null
  const targetNumber = String(targetAccount.bank_account_number || "").trim()
  const sourceLabel = await resolveTransferSourceLabel(client, {
    institutionId,
    branchId,
    sourceMode: mode,
    sourceBankAccountId,
  })
  const transferDescription = buildInSaccoTransferDescription(sourceLabel, targetNumber)

  const txDate =
    dateOnly.length >= 10
      ? new Date(`${dateOnly.slice(0, 10)}T12:00:00.000Z`).toISOString()
      : new Date().toISOString()

  const targetBeforeRow = await getBranchBankAccount(client, {
    bankAccountId: targetAccount.id,
    institutionId,
    branchId,
  })
  if (!targetBeforeRow) throw new PaymentSettlementFailure("bank_account_not_found")
  const targetBalanceBefore = Number(targetBeforeRow.total_amount ?? 0)

  const sourceBalanceBefore = await readSourceChannelBalance(client, {
    institutionId,
    branchId,
    mode,
    sourceBankAccountId,
  })

  const sourceBankId = isBankRoutedPaymentMode(mode)
    ? String(sourceBankAccountId || "").trim() || null
    : null

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount,
    charges: settlementCharges,
    mode,
    flow: "outflow",
    actor,
    bankAccountId: sourceBankId,
    referenceNumber: sourceRef,
  })

  const sourceBalanceAfter = await readSourceChannelBalance(client, {
    institutionId,
    branchId,
    mode,
    sourceBankAccountId,
  })

  const sourceTx = await createTransaction(client, {
    institutionId,
    branchId,
    bankAccountId: sourceBankId,
    type: IN_SACCO_TRANSFER_TRANSACTION_TYPE,
    amount,
    mode,
    description: transferDescription,
    referenceNumber: mode === "Cash" ? inflowRef : sourceRef,
    balanceBefore: sourceBalanceBefore,
    balanceAfter: sourceBalanceAfter,
    charges: null,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
    thirdPartyAgentId: targetAccount.third_party_agent_id,
  })

  let chargesExpenseId: string | undefined
  let chargesTransactionId: string | undefined
  if (settlementCharges) {
    const chargesResult = await recordTransactionChargesExpense(client, {
      institutionId,
      branchId,
      actor,
      amount: settlementCharges,
      mode,
      date: dateOnly,
      expenseDescription: `In Sacco transfer charges to ${bankLabel(targetNumber)}`,
      cashflowDescription: "In Sacco transfer charges",
      referenceNumber: sourceRef,
      bankAccountId: sourceBankId,
      thirdPartyAgentId: targetAccount.third_party_agent_id,
    })
    chargesExpenseId = chargesResult.expenseId
    chargesTransactionId = chargesResult.transactionId
  }

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount,
    charges: null,
    mode: "Bank Transfer",
    flow: "inflow",
    actor,
    bankAccountId: targetAccount.id,
    referenceNumber: inflowRef,
  })

  const targetBalanceAfter = targetBalanceBefore + amount

  await createTransaction(client, {
    institutionId,
    branchId,
    bankAccountId: targetAccount.id,
    type: IN_SACCO_TRANSFER_TRANSACTION_TYPE,
    amount,
    mode: "Bank Transfer",
    description: transferDescription,
    referenceNumber: inflowRef,
    balanceBefore: targetBalanceBefore,
    balanceAfter: targetBalanceAfter,
    charges: null,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
    thirdPartyAgentId: targetAccount.third_party_agent_id,
  })

  return {
    transactionId: sourceTx.id,
    transactionNumber: sourceTx.transactionNumber,
    totalAmount: targetBalanceAfter,
    chargesExpenseId,
    chargesTransactionId,
  }
}
