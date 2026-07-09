/** Client-safe helpers for expense cashflow payment totals. */

export function computeExpenseCashflowPaymentTotals(amount: number, paidAmount: number) {
  const total = Math.max(Number(amount || 0), 0)
  const paid = Math.max(Number(paidAmount || 0), 0)
  return {
    paid_amount: paid,
    outstanding: Math.max(total - paid, 0),
  }
}
