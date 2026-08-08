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
import {
  IN_SACCO_TRANSFER_TRANSACTION_TYPE,
  mapBankAccountDepositSettlementError,
  resolveTransferSourceLabel,
} from "@/lib/finances/bank-account-balance-deposit"

export type BankAccountWithdrawSource = {
  id: string
  branch_id: string
  third_party_agent_id: string
  bank_name: string
  bank_account_number: string
}

export interface RecordBankAccountWithdrawInput {
  client: PoolClient
  actor: ActorContext & { branch_id: string }
  sourceAccount: BankAccountWithdrawSource
  amount: number
  charges: number
  /** Transfer-to mode (Cash, Mobile Money, Bank Transfer, …). */
  destinationMode: string
  date: string
  /** Reference below amount (source bank leg). */
  ledgerReferenceNumber: string
  /** Mode reference for non-cash destination leg. */
  destinationReferenceNumber?: string | null
  /** Destination bank when `destinationMode` is bank-routed (not the source). */
  destinationBankAccountId?: string | null
}

export interface RecordBankAccountWithdrawResult {
  transactionId: string
  transactionNumber: string
  totalAmount: number
  chargesExpenseId?: string
  chargesTransactionId?: string
}

function bankLabel(accountNumber: string): string {
  const n = String(accountNumber || "").trim()
  return n ? `Bank ${n}` : "Bank"
}

export function buildBankWithdrawDescription(
  sourceAccountNumber: string,
  destinationLabel: string,
): string {
  return `Transfer from ${bankLabel(sourceAccountNumber)} to ${destinationLabel}`
}

async function readDestinationChannelBalance(
  client: PoolClient,
  params: {
    institutionId: string
    branchId: string
    mode: string
    destinationBankAccountId?: string | null
  },
): Promise<number> {
  if (isBankRoutedPaymentMode(params.mode)) {
    const destId = String(params.destinationBankAccountId || "").trim()
    const row = await getBranchBankAccount(client, {
      bankAccountId: destId,
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

export { mapBankAccountDepositSettlementError as mapBankAccountWithdrawSettlementError }

/**
 * Withdraw from a bank account: ledger bank-transfer row, debit source bank,
 * optional charges expense chain, destination leg row, credit transfer-to float/bank.
 * Must run inside the caller's open DB transaction.
 */
export async function recordBankAccountWithdraw(
  input: RecordBankAccountWithdrawInput,
): Promise<RecordBankAccountWithdrawResult> {
  const {
    client,
    actor,
    sourceAccount,
    amount,
    charges,
    destinationMode,
    date,
    ledgerReferenceNumber,
    destinationReferenceNumber = null,
    destinationBankAccountId = null,
  } = input

  const institutionId = actor.institution_id
  const branchId = String(sourceAccount.branch_id)
  const destMode = normalizePaymentMode(destinationMode)
  if (!destMode) throw new PaymentSettlementFailure("invalid_mode")

  const ledgerRef = String(ledgerReferenceNumber || "").trim()
  if (!ledgerRef) throw new PaymentSettlementFailure("reference_number_required")

  const destRef =
    destMode === "Cash"
      ? null
      : String(destinationReferenceNumber || "").trim() || null

  const modeValidation = validatePaymentModeInput({
    mode: destMode,
    referenceNumber: destRef,
    bankAccountId: isBankRoutedPaymentMode(destMode) ? destinationBankAccountId : null,
  })
  if (modeValidation) throw new PaymentSettlementFailure(modeValidation)

  if (isBankRoutedPaymentMode(destMode)) {
    const destId = String(destinationBankAccountId || "").trim()
    if (destId === sourceAccount.id) {
      throw new PaymentSettlementFailure("invalid_settlement_amount")
    }
  }

  const dateOnly = toDateOnlyString(date)
  if (!dateOnly) throw new PaymentSettlementFailure("invalid_settlement_amount")

  const settlementCharges = charges > 0 ? charges : null
  const settlementTotal = amount + (settlementCharges ?? 0)
  const sourceNumber = String(sourceAccount.bank_account_number || "").trim()

  const destinationLabel = await resolveTransferSourceLabel(client, {
    institutionId,
    branchId,
    sourceMode: destMode,
    sourceBankAccountId: destinationBankAccountId,
  })
  const transferDescription = buildBankWithdrawDescription(sourceNumber, destinationLabel)

  const txDate =
    dateOnly.length >= 10
      ? new Date(`${dateOnly.slice(0, 10)}T12:00:00.000Z`).toISOString()
      : new Date().toISOString()

  const sourceBeforeRow = await getBranchBankAccount(client, {
    bankAccountId: sourceAccount.id,
    institutionId,
    branchId,
  })
  if (!sourceBeforeRow) throw new PaymentSettlementFailure("bank_account_not_found")

  const sourceBalanceBefore = Number(sourceBeforeRow.total_amount ?? 0)
  if (settlementTotal > sourceBalanceBefore) {
    throw new PaymentSettlementFailure("insufficient_bank_balance")
  }

  const sourceBalanceAfter = sourceBalanceBefore - settlementTotal

  const destBankId = isBankRoutedPaymentMode(destMode)
    ? String(destinationBankAccountId || "").trim() || null
    : null

  const sourceTx = await createTransaction(client, {
    institutionId,
    branchId,
    bankAccountId: sourceAccount.id,
    type: IN_SACCO_TRANSFER_TRANSACTION_TYPE,
    amount,
    mode: "Bank Transfer",
    description: transferDescription,
    referenceNumber: ledgerRef,
    balanceBefore: sourceBalanceBefore,
    balanceAfter: sourceBalanceAfter,
    charges: settlementCharges,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
    thirdPartyAgentId: sourceAccount.third_party_agent_id,
  })

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount,
    charges: settlementCharges,
    mode: "Bank Transfer",
    flow: "outflow",
    actor,
    bankAccountId: sourceAccount.id,
    referenceNumber: ledgerRef,
  })

  let chargesExpenseId: string | undefined
  let chargesTransactionId: string | undefined
  if (settlementCharges) {
    const chargesResult = await recordTransactionChargesExpense(client, {
      institutionId,
      branchId,
      actor,
      amount: settlementCharges,
      mode: "Bank Transfer",
      date: dateOnly,
      expenseDescription: `In Sacco transfer charges from ${bankLabel(sourceNumber)}`,
      cashflowDescription: "In Sacco transfer charges",
      referenceNumber: ledgerRef,
      bankAccountId: sourceAccount.id,
      thirdPartyAgentId: sourceAccount.third_party_agent_id,
    })
    chargesExpenseId = chargesResult.expenseId
    chargesTransactionId = chargesResult.transactionId
  }

  const destBalanceBefore = await readDestinationChannelBalance(client, {
    institutionId,
    branchId,
    mode: destMode,
    destinationBankAccountId: destBankId,
  })
  const destBalanceAfter = destBalanceBefore + amount

  await createTransaction(client, {
    institutionId,
    branchId,
    bankAccountId: destBankId,
    type: IN_SACCO_TRANSFER_TRANSACTION_TYPE,
    amount,
    mode: destMode,
    description: transferDescription,
    referenceNumber: destRef,
    balanceBefore: destBalanceBefore,
    balanceAfter: destBalanceAfter,
    charges: null,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
    thirdPartyAgentId: sourceAccount.third_party_agent_id,
  })

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount,
    charges: null,
    mode: destMode,
    flow: "inflow",
    actor,
    bankAccountId: destBankId,
    referenceNumber: destRef,
  })

  const sourceAfter = await getBranchBankAccount(client, {
    bankAccountId: sourceAccount.id,
    institutionId,
    branchId,
  })

  return {
    transactionId: sourceTx.id,
    transactionNumber: sourceTx.transactionNumber,
    totalAmount: Number(sourceAfter?.total_amount ?? sourceBalanceAfter),
    chargesExpenseId,
    chargesTransactionId,
  }
}
