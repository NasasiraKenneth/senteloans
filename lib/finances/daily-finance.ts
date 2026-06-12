import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import {
  auditDailyFinanceInsert,
  auditDailyFinanceUpdate,
  dailyFinanceSnapshot,
} from "@/lib/audit/finances-audit"

/**
 * Which daily-finance channel a payment mode settles into.
 * - Bank Transfer / Cheque / Card  -> bank (already reflected in bank_accounts)
 * - Mobile Money                    -> mobile_money
 * - Everything else (Cash)          -> cash
 */
export type FinanceChannel = "bank" | "mobile_money" | "cash"

export function channelForMode(mode: string): FinanceChannel {
  switch (mode) {
    case "Mobile Money":
      return "mobile_money"
    case "Bank Transfer":
    case "Cheque":
    case "Card":
      return "bank"
    default:
      return "cash"
  }
}

type ActorForFinance = Pick<ActorContext, "id" | "institution_id" | "branch_id">

export interface DailyFinanceEntryParams {
  institutionId: string
  branchId: string
  /** Amount moved by this operation (e.g. total share value). */
  amount: number
  /** Payment mode used; determines which channel column is incremented. */
  mode: string
  actor: ActorForFinance
}

/**
 * Roll a money movement into the branch's `daily_finances` ledger for today.
 *
 * The ledger always tracks the *actual posting day* (DB `CURRENT_DATE` /
 * `NOW()`), never a backdated payment date. Writing to a past day's row would
 * silently rewrite history and make the running cash position for the days in
 * between inaccurate, so even backdated payments land on today's row.
 *
 * Behaviour:
 *  - `bank_total_amount` is always recomputed as the live SUM of the branch's
 *    bank_accounts.total_amount (so bank-routed payments are picked up once the
 *    caller has already credited the bank account).
 *  - The mode's channel column (`mobile_money_amount` / `cash_amount`) is
 *    incremented by `amount`. Bank-routed modes add nothing here because the
 *    money is already captured by `bank_total_amount`.
 *  - `total_amount` and `available_balance` are kept equal to the sum of the
 *    three channels.
 *  - If today's row exists -> UPDATE it.
 *  - Else -> INSERT a new row, carrying forward the previous day's
 *    mobile_money/cash balances (or 0 when there's no prior row).
 *
 * Must be called inside an open DB transaction (the caller owns BEGIN/COMMIT).
 */
export async function applyDailyFinanceEntry(
  client: PoolClient,
  { institutionId, branchId, amount, mode, actor }: DailyFinanceEntryParams,
): Promise<void> {
  const channel = channelForMode(mode)
  const mmAdd = channel === "mobile_money" ? amount : 0
  const cashAdd = channel === "cash" ? amount : 0

  // Live total across the branch's bank accounts (already includes any credit
  // the caller applied earlier in this transaction).
  const bankRes = await client.query<{ bank_total: string }>(
    `SELECT COALESCE(SUM(total_amount), 0)::numeric AS bank_total
       FROM bank_accounts
      WHERE institution_id = $1 AND branch_id = $2`,
    [institutionId, branchId],
  )
  const bankTotal = Number(bankRes.rows[0]?.bank_total || 0)

  // Today's ledger row (actual posting day), if one exists.
  const todayRes = await client.query(
    `SELECT id, bank_total_amount, mobile_money_amount, cash_amount, total_amount, available_balance, branch_id
       FROM daily_finances
      WHERE institution_id = $1 AND branch_id = $2 AND created_at::date = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 1`,
    [institutionId, branchId],
  )

  if (todayRes.rows[0]) {
    const today = todayRes.rows[0] as Record<string, unknown>
    const newMm = Number(today.mobile_money_amount ?? 0) + mmAdd
    const newCash = Number(today.cash_amount ?? 0) + cashAdd
    const newTotal = bankTotal + newMm + newCash

    const updRes = await client.query(
      `UPDATE daily_finances
          SET bank_total_amount = $1,
              mobile_money_amount = $2,
              cash_amount = $3,
              total_amount = $4,
              available_balance = $4,
              modified_by = $5,
              updated_at = NOW()
        WHERE id = $6
        RETURNING id, bank_total_amount, mobile_money_amount, cash_amount, total_amount, available_balance, branch_id`,
      [bankTotal, newMm, newCash, newTotal, actor.id, today.id],
    )
    const updated = (updRes.rows[0] as Record<string, unknown>) || {}
    await auditDailyFinanceUpdate(
      client,
      actor,
      String(today.id),
      dailyFinanceSnapshot(today),
      dailyFinanceSnapshot(updated),
      (today.branch_id as string | null | undefined) ?? branchId,
    )
    return
  }

  // No row today: carry forward the most recent prior day's channel balances.
  const prevRes = await client.query(
    `SELECT mobile_money_amount, cash_amount
       FROM daily_finances
      WHERE institution_id = $1 AND branch_id = $2 AND created_at::date < CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 1`,
    [institutionId, branchId],
  )
  const prev = prevRes.rows[0] as Record<string, unknown> | undefined
  const newMm = Number(prev?.mobile_money_amount ?? 0) + mmAdd
  const newCash = Number(prev?.cash_amount ?? 0) + cashAdd
  const newTotal = bankTotal + newMm + newCash

  const insRes = await client.query(
    `INSERT INTO daily_finances
       (institution_id, branch_id, bank_total_amount, mobile_money_amount, cash_amount,
        total_amount, available_balance, created_by, created_at, modified_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, NOW(), $7, NOW())
     RETURNING id, bank_total_amount, mobile_money_amount, cash_amount, total_amount, available_balance, branch_id`,
    [institutionId, branchId, bankTotal, newMm, newCash, newTotal, actor.id],
  )
  const inserted = (insRes.rows[0] as Record<string, unknown>) || {}
  await auditDailyFinanceInsert(
    client,
    actor,
    String(inserted.id || ""),
    dailyFinanceSnapshot(inserted),
    (inserted.branch_id as string | null | undefined) ?? branchId,
  )
}
