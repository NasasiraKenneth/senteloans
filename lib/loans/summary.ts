/** Loan statuses included in member-loan summary active count and outstanding total. */
export const LOAN_SUMMARY_ACTIVE_STATUSES = [
  "Active",
  "Partially Disbursed",
  "Fully Disbursed",
  "Defaulted",
] as const

/** SQL predicate e.g. `l.status IN ('Active', ...)` for summary aggregates. */
export function loanSummaryActiveStatusPredicate(column = "l.status"): string {
  const list = LOAN_SUMMARY_ACTIVE_STATUSES.map((s) => `'${s.replace(/'/g, "''")}'`).join(", ")
  return `${column} IN (${list})`
}
