import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import type { InvestmentCashflowCategory, InvestmentCashflowDirection } from "@/lib/investments/investment-cashflow-settlement"

export interface InvestmentValuationRow {
  id: string
  opening_value: number
  closing_value: number
  valuation_date: string
}

/**
 * Latest closing value for an investment (by valuation row created_at).
 * Falls back to the investment's tracked current_value when no valuation exists.
 */
export async function getLatestInvestmentClosingValue(
  client: PoolClient,
  investmentId: string,
  fallbackCurrentValue: number,
): Promise<number> {
  const res = await client.query<{ closing_value: string | number }>(
    `SELECT closing_value
     FROM investment_valuations
     WHERE investment_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [investmentId],
  )
  if (!res.rowCount) return Number(fallbackCurrentValue || 0)
  return Number(res.rows[0]?.closing_value ?? fallbackCurrentValue ?? 0)
}

/**
 * closing = opening
 *   + capital inflow
 *   + adjustment inflow
 *   - adjustment outflow
 *   - capital outflow
 *
 * Income and expense cashflows do not change the investment valuation balance.
 */
export function computeInvestmentValuationClosing(
  openingValue: number,
  type: InvestmentCashflowDirection,
  category: InvestmentCashflowCategory | "adjustment",
  amount: number,
): number {
  const opening = Number(openingValue || 0)
  const delta = Number(amount || 0)
  if (!(delta > 0) && category !== "income" && category !== "expense") {
    return opening
  }
  if (type === "inflow" && category === "capital") return opening + delta
  if (type === "outflow" && category === "capital") return opening - delta
  if (type === "inflow" && category === "adjustment") return opening + delta
  if (type === "outflow" && category === "adjustment") return opening - delta
  return opening
}

export interface RecordInvestmentValuationInput {
  client: PoolClient
  investmentId: string
  institutionId: string
  branchId: string
  actorId: string
  valuationDate: string
  openingValue: number
  closingValue: number
  /** Prior investments.current_value for audit when syncing current_value. */
  previousCurrentValue?: number
  /** When false, skip syncing investments.current_value (default true). */
  syncCurrentValue?: boolean
}

export async function recordInvestmentValuation(
  input: RecordInvestmentValuationInput,
): Promise<InvestmentValuationRow> {
  const {
    client,
    investmentId,
    institutionId,
    branchId,
    actorId,
    valuationDate,
    openingValue,
    closingValue,
    previousCurrentValue,
    syncCurrentValue = true,
  } = input

  const res = await client.query<{
    id: string
    opening_value: string | number
    closing_value: string | number
    valuation_date: string
  }>(
    `INSERT INTO investment_valuations (investment_id, valuation_date, opening_value, closing_value)
     VALUES ($1, $2::date, $3, $4)
     RETURNING id, opening_value, closing_value, valuation_date`,
    [investmentId, valuationDate, openingValue, closingValue],
  )
  const row = res.rows[0]
  const valuationId = String(row?.id || "")
  if (!valuationId) throw new Error("investment_valuation_insert_failed")

  await auditLogger.logInsert(
    "investment_valuations",
    valuationId,
    {
      investment_id: investmentId,
      valuation_date: valuationDate,
      opening_value: openingValue,
      closing_value: closingValue,
    },
    institutionId,
    actorId,
    { branch_id: branchId },
    client,
  )

  if (syncCurrentValue) {
    await updateInvestmentCurrentValue({
      client,
      investmentId,
      institutionId,
      branchId,
      actorId,
      closingValue,
      previousCurrentValue,
    })
  }

  return {
    id: valuationId,
    opening_value: Number(row.opening_value),
    closing_value: Number(row.closing_value),
    valuation_date: String(row.valuation_date),
  }
}

export interface UpdateInvestmentCurrentValueInput {
  client: PoolClient
  investmentId: string
  institutionId: string
  branchId: string
  actorId: string
  /** Written to investments.current_value. */
  closingValue: number
  /** Prior investments.current_value for audit. */
  previousCurrentValue?: number
  audit?: boolean
}

/**
 * Set investments.current_value to the valuation closing_value and stamp
 * modified_by / updated_at.
 */
export async function updateInvestmentCurrentValue(
  input: UpdateInvestmentCurrentValueInput,
): Promise<void> {
  const {
    client,
    investmentId,
    institutionId,
    branchId,
    actorId,
    closingValue,
    previousCurrentValue,
    audit = true,
  } = input

  const res = await client.query(
    `UPDATE investments
     SET current_value = $1,
         modified_by = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [closingValue, actorId, investmentId],
  )
  if ((res.rowCount ?? 0) === 0) {
    throw new Error("investment_not_found")
  }

  if (audit && previousCurrentValue !== undefined) {
    await auditLogger.logUpdate(
      "investments",
      investmentId,
      { current_value: previousCurrentValue },
      { current_value: closingValue },
      institutionId,
      actorId,
      { branch_id: branchId },
      client,
    )
  }
}
