/** Remaining tenure expression — falls back when column not yet migrated. */
export const SACCO_LOAN_REMAINING_TENURE_SQL =
  "COALESCE(l.remaining_tenure_months, l.tenure_months)"

export type SaccoLoanListFilterInput = {
  where: string
  params: unknown[]
  idx: number
  status?: string
  loanType?: string
  remainingTenure?: string
  applicationDateStart?: string
  applicationDateEnd?: string
  nextPaymentDateStart?: string
  nextPaymentDateEnd?: string
  q?: string
}

export function appendSaccoLoanListFilters(
  input: SaccoLoanListFilterInput,
): { where: string; params: unknown[]; idx: number } {
  let { where, params, idx } = input
  const remainingExpr = SACCO_LOAN_REMAINING_TENURE_SQL

  if (input.status) {
    where += ` AND l.status = $${idx++}`
    params.push(input.status)
  }
  if (input.loanType) {
    where += ` AND lower(l.loan_type) = $${idx++}`
    params.push(input.loanType.toLowerCase())
  }
  if (input.remainingTenure === "eq1") {
    where += ` AND ${remainingExpr} = 1`
  } else if (input.remainingTenure === "lte3") {
    where += ` AND ${remainingExpr} <= 3`
  } else if (input.remainingTenure === "lte6") {
    where += ` AND ${remainingExpr} <= 6`
  } else if (input.remainingTenure === "lte12") {
    where += ` AND ${remainingExpr} <= 12`
  } else if (input.remainingTenure === "gt12") {
    where += ` AND ${remainingExpr} > 12`
  }
  if (input.applicationDateStart) {
    where += ` AND l.application_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(input.applicationDateStart)
    idx++
  }
  if (input.applicationDateEnd) {
    where += ` AND l.application_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(input.applicationDateEnd)
    idx++
  }
  if (input.nextPaymentDateStart) {
    where += ` AND l.next_payment_date IS NOT NULL AND l.next_payment_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(input.nextPaymentDateStart)
    idx++
  }
  if (input.nextPaymentDateEnd) {
    where += ` AND l.next_payment_date IS NOT NULL AND l.next_payment_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`
    params.push(input.nextPaymentDateEnd)
    idx++
  }
  if (input.q) {
    where += ` AND (
      COALESCE(tpa.name, '') ILIKE $${idx}
      OR COALESCE(l.loan_product, '') ILIKE $${idx}
      OR COALESCE(l.purpose, '') ILIKE $${idx}
    )`
    params.push(`%${input.q}%`)
    idx++
  }

  return { where, params, idx }
}
