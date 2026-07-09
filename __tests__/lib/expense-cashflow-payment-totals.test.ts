import { computeExpenseCashflowPaymentTotals } from "@/lib/expenses/expense-cashflow-payment-totals"

describe("computeExpenseCashflowPaymentTotals", () => {
  it("sums paid amount and outstanding from cashflow total", () => {
    expect(computeExpenseCashflowPaymentTotals(1000, 250)).toEqual({
      paid_amount: 250,
      outstanding: 750,
    })
  })

  it("never returns negative outstanding", () => {
    expect(computeExpenseCashflowPaymentTotals(100, 150)).toEqual({
      paid_amount: 150,
      outstanding: 0,
    })
  })
})
