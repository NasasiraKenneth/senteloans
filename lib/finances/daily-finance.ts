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

type ChannelBalances = {
  mobile_money_amount: number
  cash_amount: number
}

type TodayDailyFinanceRow = ChannelBalances & {
  id: string
  bank_total_amount: number
  total_amount: number
  available_balance: number
  branch_id: string
}

export interface DailyFinanceEntryParams {
  institutionId: string
  branchId: string
  /** Signed or unsigned delta for the mode's channel (negative = outflow). */
  amount: number
  /** Payment mode used; determines which channel column is adjusted. */
  mode: string
  actor: ActorForFinance
}

async function loadTodayDailyFinanceRow(
  client: PoolClient,
  institutionId: string,
  branchId: string,
): Promise<TodayDailyFinanceRow | null> {
  const todayRes = await client.query(
    `SELECT id, bank_total_amount, mobile_money_amount, cash_amount, total_amount, available_balance, branch_id
       FROM daily_finances
      WHERE institution_id = $1 AND branch_id = $2 AND created_at::date = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 1`,
    [institutionId, branchId],
  )
  const row = todayRes.rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: String(row.id),
    bank_total_amount: Number(row.bank_total_amount ?? 0),
    mobile_money_amount: Number(row.mobile_money_amount ?? 0),
    cash_amount: Number(row.cash_amount ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    available_balance: Number(row.available_balance ?? 0),
    branch_id: String(row.branch_id || branchId),
  }
}

async function loadPriorChannelBalances(
  client: PoolClient,
  institutionId: string,
  branchId: string,
): Promise<ChannelBalances> {
  const prevRes = await client.query(
    `SELECT mobile_money_amount, cash_amount
       FROM daily_finances
      WHERE institution_id = $1 AND branch_id = $2 AND created_at::date < CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 1`,
    [institutionId, branchId],
  )
  const prev = prevRes.rows[0] as Record<string, unknown> | undefined
  return {
    mobile_money_amount: Number(prev?.mobile_money_amount ?? 0),
    cash_amount: Number(prev?.cash_amount ?? 0),
  }
}

function channelBalance(channel: FinanceChannel, balances: ChannelBalances): number {
  if (channel === "mobile_money") return balances.mobile_money_amount
  if (channel === "cash") return balances.cash_amount
  return 0
}

/**
 * Effective cash or mobile-money balance for a payment mode on the posting day.
 * Uses today's `daily_finances` row when present, otherwise carries forward
 * the most recent prior day's channel balances.
 */
export async function getDailyFinanceChannelBalance(
  client: PoolClient,
  params: { institutionId: string; branchId: string; mode: string },
): Promise<{ channel: FinanceChannel; balance: number }> {
  const channel = channelForMode(params.mode)
  if (channel === "bank") return { channel, balance: 0 }

  const today = await loadTodayDailyFinanceRow(client, params.institutionId, params.branchId)
  if (today) {
    return { channel, balance: channelBalance(channel, today) }
  }

  const prior = await loadPriorChannelBalances(client, params.institutionId, params.branchId)
  return { channel, balance: channelBalance(channel, prior) }
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
 *    adjusted by `amount` (negative allowed for outflows). Bank-routed modes add
 *    nothing here because the money is already captured by `bank_total_amount`.
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

  const bankRes = await client.query<{ bank_total: string }>(
    `SELECT COALESCE(SUM(total_amount), 0)::numeric AS bank_total
       FROM bank_accounts
      WHERE institution_id = $1 AND branch_id = $2`,
    [institutionId, branchId],
  )
  const bankTotal = Number(bankRes.rows[0]?.bank_total || 0)

  const today = await loadTodayDailyFinanceRow(client, institutionId, branchId)

  if (today) {
    const newMm = today.mobile_money_amount + mmAdd
    const newCash = today.cash_amount + cashAdd
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
      today.id,
      dailyFinanceSnapshot(today),
      dailyFinanceSnapshot(updated),
      today.branch_id ?? branchId,
    )
    return
  }

  const prior = await loadPriorChannelBalances(client, institutionId, branchId)
  const newMm = prior.mobile_money_amount + mmAdd
  const newCash = prior.cash_amount + cashAdd
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
