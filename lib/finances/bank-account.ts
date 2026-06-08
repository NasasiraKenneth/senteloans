import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import { auditBankAccountUpdate } from "@/lib/audit/finances-audit"

type ActorForFinance = Pick<ActorContext, "id" | "institution_id" | "branch_id">

export interface BankAccountRow {
  id: string
  bank_name: string
  bank_account_number: string
  available_balance: string | number | null
  total_amount: string | number | null
  branch_id: string
}

/**
 * Resolve a bank account scoped to a specific institution + branch.
 * Returns null when no matching account exists (callers map this to their own
 * "bank_account_not_found" style error).
 */
export async function getBranchBankAccount(
  client: PoolClient,
  params: { bankAccountId: string; institutionId: string; branchId: string },
): Promise<BankAccountRow | null> {
  const res = await client.query<BankAccountRow>(
    `SELECT id, bank_name, bank_account_number, available_balance, total_amount, branch_id
       FROM bank_accounts
      WHERE id = $1 AND institution_id = $2 AND branch_id = $3
      LIMIT 1`,
    [params.bankAccountId, params.institutionId, params.branchId],
  )
  return res.rows[0] || null
}

/**
 * Adjust a bank account's balances by `amount`:
 *  - positive  -> credit (money in)
 *  - negative  -> debit  (money out)
 *
 * Updates `available_balance` and `total_amount` together, stamps
 * `modified_by` / `updated_at`, and writes a finance audit-log entry.
 * Must run inside the caller's open DB transaction.
 *
 * Note: `available_balance` has a CHECK (>= 0); a debit that overdraws will
 * raise a constraint error which the caller's transaction should handle.
 */
export async function adjustBankAccountBalance(
  client: PoolClient,
  params: {
    account: Pick<BankAccountRow, "id" | "available_balance" | "total_amount" | "branch_id">
    amount: number
    actor: ActorForFinance
  },
): Promise<{ availableBalance: number; totalAmount: number }> {
  const { account, amount, actor } = params
  const prevAvailable = Number(account.available_balance ?? 0)
  const prevTotal = Number(account.total_amount ?? 0)

  const updRes = await client.query<{ available_balance: string; total_amount: string }>(
    `UPDATE bank_accounts
        SET available_balance = COALESCE(available_balance, 0) + $1,
            total_amount = COALESCE(total_amount, 0) + $1,
            modified_by = $2,
            updated_at = NOW()
      WHERE id = $3
      RETURNING available_balance, total_amount`,
    [amount, actor.id, account.id],
  )
  const updated = updRes.rows[0]
  const availableBalance = Number(updated?.available_balance ?? prevAvailable + amount)
  const totalAmount = Number(updated?.total_amount ?? prevTotal + amount)

  await auditBankAccountUpdate(
    client,
    actor,
    account.id,
    { available_balance: prevAvailable, total_amount: prevTotal },
    { available_balance: availableBalance, total_amount: totalAmount, modified_by: actor.id },
    account.branch_id,
  )

  return { availableBalance, totalAmount }
}
