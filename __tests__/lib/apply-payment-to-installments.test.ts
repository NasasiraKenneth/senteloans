import {
  applyPaymentToInstallments,
  installmentRemainingDue,
} from "@/lib/loans/apply-payment-to-installments"

const inst = (id: string, total: number, paid = 0, penalty = 0) => ({
  id,
  total_amount: total,
  penalty_amount: penalty,
  amount_paid: paid,
  status: paid > 0 && paid < total ? "Partial" : paid >= total ? "Paid" : "Pending",
})

describe("installmentRemainingDue", () => {
  it("returns full installment when nothing paid", () => {
    expect(installmentRemainingDue(inst("1", 1000))).toBe(1000)
  })

  it("returns remaining after partial payment", () => {
    expect(installmentRemainingDue(inst("1", 1000, 500))).toBe(500)
  })

  it("includes penalty in base total", () => {
    expect(installmentRemainingDue(inst("1", 1000, 0, 50))).toBe(1050)
  })
})

describe("applyPaymentToInstallments", () => {
  it("pays a single installment in full", () => {
    const { updates, totalApplied } = applyPaymentToInstallments([inst("1", 1000)], 1000)
    expect(totalApplied).toBe(1000)
    expect(updates).toEqual([{ id: "1", amount_paid: 1000, amount_due: 0, status: "Paid" }])
  })

  it("carries overpayment to the next installment", () => {
    const rows = [inst("1", 1000), inst("2", 1000)]
    const { updates, totalApplied } = applyPaymentToInstallments(rows, 1500)

    expect(totalApplied).toBe(1500)
    expect(updates).toEqual([
      { id: "1", amount_paid: 1000, amount_due: 0, status: "Paid" },
      { id: "2", amount_paid: 500, amount_due: 500, status: "Partial" },
    ])
  })

  it("completes a partial installment when only that row is unpaid", () => {
    const rows = [inst("2", 1000, 500)]
    const { updates, totalApplied, remaining } = applyPaymentToInstallments(rows, 1500)

    expect(totalApplied).toBe(500)
    expect(remaining).toBe(1000)
    expect(updates).toEqual([{ id: "2", amount_paid: 1000, amount_due: 0, status: "Paid" }])
  })

  it("handles two consecutive overpayments across installments", () => {
    const afterFirst = applyPaymentToInstallments([inst("1", 1000), inst("2", 1000)], 1500)
    expect(afterFirst.updates[1]).toEqual({
      id: "2",
      amount_paid: 500,
      amount_due: 500,
      status: "Partial",
    })

    const rowsAfterFirst = [
      { ...inst("2", 1000, 500), amount_due: 500 },
      inst("3", 1000),
    ]
    const afterSecond = applyPaymentToInstallments(rowsAfterFirst, 1500)

    expect(afterSecond.updates).toEqual([
      { id: "2", amount_paid: 1000, amount_due: 0, status: "Paid" },
      { id: "3", amount_paid: 1000, amount_due: 0, status: "Paid" },
    ])
    expect(afterSecond.totalApplied).toBe(1500)
  })
})
