import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"

/**
 * Parameters for inserting a row into the `transactions` ledger.
 *
 * Only the always-required columns are mandatory; every optional reference
 * (member/account/loan/etc.) defaults to NULL so each caller passes just the
 * fields relevant to its flow.
 */
export interface CreateTransactionParams {
  institutionId: string
  branchId: string
  /** transaction_type enum value, e.g. "Deposit", "Shares Purchase". */
  type: string
  /** Must be > 0 (enforced by a CHECK constraint). */
  amount: number
  /** payment_mode enum value, e.g. "Cash", "Bank Transfer". */
  mode: string
  /** App user id recorded as processed_by. */
  processedBy: string
  transactionDate: Date | string

  // Optional party / reference columns
  memberId?: string | null
  thirdPartyAgentId?: string | null
  staffId?: string | null
  accountId?: string | null
  transferredToId?: string | null
  loanId?: string | null
  saccoLoanId?: string | null

  // Optional detail columns
  description?: string | null
  referenceNumber?: string | null
  balanceBefore?: number | null
  balanceAfter?: number | null
  charges?: number | null
  /** transaction_status enum; defaults to "Completed". */
  status?: string

  /**
   * Provide to insert a specific transaction_number (no retry). When omitted,
   * a collision-safe number is generated using `prefix` (default "TXN").
   */
  transactionNumber?: string
  prefix?: string
}

export interface CreatedTransaction {
  id: string
  transactionNumber: string
}

const INSERT_COLUMNS =
  "institution_id, branch_id, member_id, third_party_agent_id, staff_id, account_id, " +
  "transferred_to_id, loan_id, sacco_loan_id, transaction_number, type, amount, mode, " +
  "description, reference_number, balance_before, balance_after, charges, processed_by, " +
  "transaction_date, status"

const INSERT_SQL = `INSERT INTO transactions (${INSERT_COLUMNS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
  RETURNING id`

/**
 * Insert a transaction (and, by default, write an audit-log entry) using the
 * shared collision-safe transaction-number retry. Intended to be the single
 * entry point every API uses for writing to the `transactions` table.
 *
 * Must run inside an open DB transaction owned by the caller.
 */
export async function createTransaction(
  client: PoolClient,
  params: CreateTransactionParams,
  options?: { audit?: boolean },
): Promise<CreatedTransaction> {
  const {
    institutionId,
    branchId,
    type,
    amount,
    mode,
    processedBy,
    transactionDate,
    memberId = null,
    thirdPartyAgentId = null,
    staffId = null,
    accountId = null,
    transferredToId = null,
    loanId = null,
    saccoLoanId = null,
    description = null,
    referenceNumber = null,
    balanceBefore = null,
    balanceAfter = null,
    charges = null,
    status = "Completed",
    transactionNumber,
    prefix,
  } = params

  const audit = options?.audit ?? true
  const txDateIso =
    typeof transactionDate === "string" ? transactionDate : transactionDate.toISOString()

  const buildValues = (txNumber: string) => [
    institutionId,
    branchId,
    memberId,
    thirdPartyAgentId,
    staffId,
    accountId,
    transferredToId,
    loanId,
    saccoLoanId,
    txNumber,
    type,
    amount,
    mode,
    description,
    referenceNumber,
    balanceBefore,
    balanceAfter,
    charges,
    processedBy,
    txDateIso,
    status,
  ]

  let id: string
  let finalNumber: string

  if (transactionNumber) {
    const res = await client.query<{ id: string }>(INSERT_SQL, buildValues(transactionNumber))
    if (!res.rows[0]?.id) throw new Error("transaction_insert_failed")
    id = res.rows[0].id
    finalNumber = transactionNumber
  } else {
    const result = await insertWithTransactionNumberRetry<{ id: string }>(
      (txNumber) => client.query<{ id: string }>(INSERT_SQL, buildValues(txNumber)),
      { client, prefix },
    )
    if (!result) throw new Error("transaction_insert_failed")
    id = result.row.id
    finalNumber = result.transactionNumber
  }

  if (audit) {
    await auditLogger.logInsert(
      "transactions",
      id,
      {
        member_id: memberId,
        third_party_agent_id: thirdPartyAgentId,
        staff_id: staffId,
        account_id: accountId,
        transferred_to_id: transferredToId,
        loan_id: loanId,
        sacco_loan_id: saccoLoanId,
        transaction_number: finalNumber,
        type,
        amount,
        mode,
        description,
        reference_number: referenceNumber,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        charges,
        processed_by: processedBy,
        transaction_date: txDateIso,
        status,
      },
      institutionId,
      processedBy,
      branchId ? { branch_id: branchId } : undefined,
      client,
    )
  }

  return { id, transactionNumber: finalNumber }
}
