import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { normalizePaymentMode } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { createTransaction } from "@/lib/transactions/create-transaction"

export interface GrantReceiptPaymentInput {
  mode: string
  referenceNumber?: string | null
  bankAccountId?: string | null
  date?: string | null
}

export interface RecordGrantReceiptParams {
  client: PoolClient
  actor: ActorContext & { branch_id: string }
  institutionId: string
  branchId: string
  grantId: string
  thirdPartyAgentId: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  payment: GrantReceiptPaymentInput
}

export interface RecordGrantReceiptResult {
  transactionId: string
  transactionNumber: string
}

export function parseGrantReceiptPayment(body: Record<string, unknown>): GrantReceiptPaymentInput {
  const dateRaw = String(body?.date || body?.payment_date || "").trim()
  return {
    mode: String(body?.mode || "").trim(),
    referenceNumber: String(body?.reference_number || "").trim() || null,
    bankAccountId: String(body?.bank_account_id || "").trim() || null,
    date: dateRaw ? toDateOnlyString(dateRaw) : toDateOnlyString(new Date()),
  }
}

export function validateGrantReceiptPayment(
  amount: number,
  payment: GrantReceiptPaymentInput,
): string | null {
  if (amount <= 0) return null
  const mode = normalizePaymentMode(payment.mode)
  if (!mode) return "invalid_payment_mode"
  return validatePaymentModeInput({
    mode,
    referenceNumber: payment.referenceNumber,
    bankAccountId: payment.bankAccountId,
  })
}

export function mapGrantReceiptSettlementError(code: PaymentSettlementFailure["code"]): string {
  switch (code) {
    case "insufficient_bank_balance":
      return "insufficient_bank_balance"
    case "insufficient_cash_balance":
      return "insufficient_cash_balance"
    case "insufficient_mobile_money_balance":
      return "insufficient_mobile_money_balance"
    case "invalid_mode":
      return "invalid_payment_mode"
    case "reference_number_required":
      return "reference_number_required"
    case "bank_account_required":
      return "bank_account_required"
    case "bank_account_not_found":
      return "invalid_bank_account"
    case "invalid_settlement_amount":
      return "invalid_amount"
    default:
      return code
  }
}

/**
 * Settle branch inflow for a grant receipt, then write the ledger transaction.
 * Must run inside the caller's open DB transaction.
 */
export async function recordGrantReceipt(
  params: RecordGrantReceiptParams,
): Promise<RecordGrantReceiptResult> {
  const {
    client,
    actor,
    institutionId,
    branchId,
    grantId,
    thirdPartyAgentId,
    amount,
    balanceBefore,
    balanceAfter,
    payment,
  } = params

  const mode = normalizePaymentMode(payment.mode)
  if (!mode) throw new PaymentSettlementFailure("invalid_mode")

  const agentRes = await client.query<{ name: string }>(
    `SELECT name FROM third_party_agents WHERE id = $1::uuid LIMIT 1`,
    [thirdPartyAgentId],
  )
  const agentName = String(agentRes.rows[0]?.name || "").trim() || "Third party agent"
  const txDate = payment.date || toDateOnlyString(new Date())
  const bankAccountId = payment.bankAccountId || null
  const referenceNumber = payment.referenceNumber || null

  await settlePaymentByMode(client, {
    institutionId,
    branchId,
    amount,
    charges: null,
    mode,
    flow: "inflow",
    actor,
    bankAccountId,
    referenceNumber,
  })

  const tx = await createTransaction(client, {
    institutionId,
    branchId,
    thirdPartyAgentId,
    bankAccountId,
    type: "Grant",
    amount,
    mode,
    description: `Grant receipt from ${agentName}`,
    referenceNumber,
    balanceBefore,
    balanceAfter,
    charges: null,
    processedBy: actor.id,
    transactionDate: txDate,
    prefix: "TXN",
  })

  return {
    transactionId: tx.id,
    transactionNumber: tx.transactionNumber,
  }
}
