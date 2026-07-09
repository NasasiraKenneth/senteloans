import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import {
  adjustBankAccountBalance,
  getBranchBankAccount,
  type BankAccountRow,
} from "@/lib/finances/bank-account"
import { applyDailyFinanceEntry, getDailyFinanceChannelBalance } from "@/lib/finances/daily-finance"
import {
  isBankRoutedPaymentMode,
  normalizePaymentMode,
  PAYMENT_MODES,
  type PaymentMode,
} from "@/lib/finances/payment-mode"

/**
 * Payment-mode settlement for branch **outflows** (loan disbursement) and
 * **inflows** (loan repayment).
 *
 * Composes `bank-account.ts` + `daily-finance.ts` so Cash / Mobile Money /
 * bank-routed modes all debit the correct float (including cash_amount and
 * mobile_money_amount on `daily_finances`).
 *
 * Member **inflows** (shares, membership fees, opening balances) keep calling
 * `adjustBankAccountBalance` + `applyDailyFinanceEntry` directly in their APIs.
 */

type ActorForFinance = Pick<ActorContext, "id" | "institution_id" | "branch_id">

/** Money movement relative to the branch float. */
export type PaymentFlow = "inflow" | "outflow"

export type PaymentModeValidationError =
  | "invalid_mode"
  | "reference_number_required"
  | "bank_account_required"

export type PaymentSettlementError =
  | PaymentModeValidationError
  | "bank_account_not_found"
  | "invalid_settlement_amount"
  | "insufficient_bank_balance"
  | "insufficient_cash_balance"
  | "insufficient_mobile_money_balance"

export class PaymentSettlementFailure extends Error {
  constructor(public readonly code: PaymentSettlementError) {
    super(code)
    this.name = "PaymentSettlementFailure"
  }
}

export function isPaymentMode(value: string): value is PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(value)
}

/**
 * Shared payment-mode validation (reference, bank account). Used by loan
 * disbursement and loan repayment.
 */
export function validatePaymentModeInput(params: {
  mode: string
  referenceNumber?: string | null
  bankAccountId?: string | null
}): PaymentModeValidationError | null {
  const normalized = normalizePaymentMode(params.mode)
  if (!normalized) return "invalid_mode"
  if (normalized !== "Cash" && !String(params.referenceNumber || "").trim()) {
    return "reference_number_required"
  }
  if (isBankRoutedPaymentMode(normalized) && !String(params.bankAccountId || "").trim()) {
    return "bank_account_required"
  }
  return null
}

export interface SettlePaymentByModeParams {
  institutionId: string
  branchId: string
  /** Positive principal / payment amount (before charges). */
  amount: number
  /** Optional fees (e.g. bank/mobile-money charges); added to `amount` for settlement. */
  charges?: number | null
  mode: string
  /**
   * - `inflow`  — money received by the branch (member payment).
   * - `outflow` — money paid out by the branch (loan disburse, expense).
   */
  flow: PaymentFlow
  actor: ActorForFinance
  bankAccountId?: string | null
  referenceNumber?: string | null
}

/**
 * Settle a payment against branch finances:
 * - Bank Transfer / Cheque / Card → debit/credit the selected bank account.
 * - Cash / Mobile Money → debit/credit today's daily_finances channel balance.
 *
 * Bank-routed flows refresh the daily ledger bank total from live accounts.
 * Must run inside the caller's open DB transaction.
 */
export async function settlePaymentByMode(
  client: PoolClient,
  params: SettlePaymentByModeParams,
): Promise<{ bankAccount: BankAccountRow | null; mode: PaymentMode }> {
  const { institutionId, branchId, flow, actor } = params
  const amount = Number(params.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentSettlementFailure("invalid_settlement_amount")
  }

  const charges = params.charges == null ? 0 : Number(params.charges)
  if (Number.isNaN(charges) || charges < 0) {
    throw new PaymentSettlementFailure("invalid_settlement_amount")
  }

  const settlementTotal = amount + charges
  if (!Number.isFinite(settlementTotal) || settlementTotal <= 0) {
    throw new PaymentSettlementFailure("invalid_settlement_amount")
  }

  const mode = normalizePaymentMode(params.mode)
  if (!mode) throw new PaymentSettlementFailure("invalid_mode")

  const validationError = validatePaymentModeInput({
    mode,
    referenceNumber: params.referenceNumber,
    bankAccountId: params.bankAccountId,
  })
  if (validationError) throw new PaymentSettlementFailure(validationError)

  const signed = flow === "inflow" ? settlementTotal : -settlementTotal

  if (isBankRoutedPaymentMode(mode)) {
    const bankAccountId = String(params.bankAccountId || "").trim()
    if (!bankAccountId) throw new PaymentSettlementFailure("bank_account_required")

    const bankAccount = await getBranchBankAccount(client, {
      bankAccountId,
      institutionId,
      branchId,
    })
    if (!bankAccount) throw new PaymentSettlementFailure("bank_account_not_found")

    if (flow === "outflow") {
      const available = Number(bankAccount.available_balance ?? 0)
      if (available < settlementTotal) throw new PaymentSettlementFailure("insufficient_bank_balance")
    }

    await adjustBankAccountBalance(client, {
      account: bankAccount,
      amount: signed,
      actor,
    })

    await applyDailyFinanceEntry(client, {
      institutionId,
      branchId,
      amount: 0,
      mode,
      actor,
    })

    return { bankAccount, mode }
  }

  if (flow === "outflow") {
    const { channel, balance } = await getDailyFinanceChannelBalance(client, {
      institutionId,
      branchId,
      mode,
    })
    if (balance < settlementTotal) {
      throw new PaymentSettlementFailure(
        channel === "mobile_money" ? "insufficient_mobile_money_balance" : "insufficient_cash_balance",
      )
    }
  }

  await applyDailyFinanceEntry(client, {
    institutionId,
    branchId,
    amount: signed,
    mode,
    actor,
  })

  return { bankAccount: null, mode }
}
