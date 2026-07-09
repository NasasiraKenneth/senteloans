export type InstallmentForPayment = {
  id: string
  total_amount: number | string
  penalty_amount?: number | string | null
  amount_paid?: number | string | null
  status?: string
}

export type InstallmentPaymentUpdate = {
  id: string
  amount_paid: number
  amount_due: number
  status: "Paid" | "Partial"
}

/** Remaining due on an installment (principal+interest+penalty minus paid so far). */
export function installmentRemainingDue(row: InstallmentForPayment): number {
  const baseTotal = Number(row.total_amount || 0) + Number(row.penalty_amount || 0)
  const paid = Number(row.amount_paid || 0)
  return Math.max(0, baseTotal - paid)
}

/** Allocate a payment FIFO across unpaid installments. */
export function applyPaymentToInstallments(
  rows: InstallmentForPayment[],
  paymentAmount: number,
): { updates: InstallmentPaymentUpdate[]; totalApplied: number; remaining: number } {
  let remaining = paymentAmount
  const updates: InstallmentPaymentUpdate[] = []

  for (const row of rows) {
    if (remaining <= 0) break
    const paid = Number(row.amount_paid || 0)
    const baseTotal = Number(row.total_amount || 0) + Number(row.penalty_amount || 0)
    const due = installmentRemainingDue(row)
    const apply = Math.min(remaining, due)
    if (apply <= 0) continue
    const newPaid = paid + apply
    const newAmountDue = Math.max(0, baseTotal - newPaid)
    const newStatus: "Paid" | "Partial" = newAmountDue <= 0 ? "Paid" : "Partial"
    updates.push({ id: row.id, amount_paid: newPaid, amount_due: newAmountDue, status: newStatus })
    remaining -= apply
  }

  return { updates, totalApplied: paymentAmount - remaining, remaining }
}
