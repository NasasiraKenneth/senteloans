import { buildRepaymentSchedule, calculateLoanTerms } from "@/lib/loans/calculations"

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe("calculateLoanTerms + buildRepaymentSchedule", () => {
  const P = 1_000_000
  const annual = 24
  const n = 12
  const start = "2025-01-15"

  describe("reducing_balance", () => {
    const method = "reducing_balance"

    it("uses standard annuity when r > 0", () => {
      const terms = calculateLoanTerms(P, annual, n, method)
      const r = annual / 100 / 12
      const expected = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      expect(terms.monthlyPayment).toBeCloseTo(expected, 1)
      expect(terms.totalAmount).toBeCloseTo(terms.monthlyPayment * n, 1)
    })

    it("schedule: principal sums to P and balance ends near zero", () => {
      const terms = calculateLoanTerms(P, annual, n, method)
      const rows = buildRepaymentSchedule({ principal: P, annualRate: annual, tenureMonths: n, method, startDate: start })
      expect(rows).toHaveLength(n)
      const principalSum = sum(rows.map((r) => r.principalAmount))
      expect(principalSum).toBeCloseTo(P, 0)

      let bal = P
      for (const row of rows) {
        bal -= row.principalAmount
      }
      expect(bal).toBeCloseTo(0, 0)
      const scheduleTotal = sum(rows.map((r) => r.totalAmount))
      expect(scheduleTotal).toBeCloseTo(terms.totalAmount, 0)
    })

    it("when r = 0, payment is principal / n", () => {
      const terms = calculateLoanTerms(P, 0, n, method)
      expect(terms.monthlyPayment).toBeCloseTo(P / n, 2)
      expect(terms.totalAmount).toBeCloseTo(P, 2)
      const rows = buildRepaymentSchedule({ principal: P, annualRate: 0, tenureMonths: n, method, startDate: start })
      for (const row of rows) {
        expect(row.interestAmount).toBe(0)
      }
      expect(sum(rows.map((r) => r.principalAmount))).toBeCloseTo(P, 0)
    })
  })

  describe("flat_rate", () => {
    const method = "flat_rate"

    it("totalAmount matches simple interest on principal for term n/12 years", () => {
      const terms = calculateLoanTerms(P, annual, n, method)
      const totalInterest = P * (annual / 100) * (n / 12)
      expect(terms.totalAmount).toBeCloseTo(P + totalInterest, 0)
      expect(terms.monthlyPayment).toBeCloseTo(terms.totalAmount / n, 0)
    })

    it("schedule: equal interest per month; principals sum to P", () => {
      const terms = calculateLoanTerms(P, annual, n, method)
      const rows = buildRepaymentSchedule({ principal: P, annualRate: annual, tenureMonths: n, method, startDate: start })
      expect(rows).toHaveLength(n)
      const interestSet = new Set(rows.map((r) => r.interestAmount))
      expect(interestSet.size).toBe(1)
      const expectedInterestPer = Math.round((P * (annual / 100) * (n / 12)) / n * 100) / 100
      expect(rows[0].interestAmount).toBeCloseTo(expectedInterestPer, 1)
      expect(sum(rows.map((r) => r.principalAmount))).toBeCloseTo(P, 0)
      const schedulePay = sum(rows.map((r) => r.totalAmount))
      expect(schedulePay).toBeCloseTo(terms.totalAmount, 0)
    })
  })

  describe("compound", () => {
    const method = "compound"

    it("totalAmount matches P*(1+r)^n", () => {
      const terms = calculateLoanTerms(P, annual, n, method)
      const r = annual / 100 / 12
      const expectedTotal = P * Math.pow(1 + r, n)
      expect(terms.totalAmount).toBeCloseTo(expectedTotal, 0)
      expect(terms.monthlyPayment).toBeCloseTo(terms.totalAmount / n, 0)
    })

    it("schedule: principals sum to P; installment totals sum to terms.totalAmount", () => {
      const terms = calculateLoanTerms(P, annual, n, method)
      const rows = buildRepaymentSchedule({ principal: P, annualRate: annual, tenureMonths: n, method, startDate: start })
      expect(rows).toHaveLength(n)
      expect(sum(rows.map((r) => r.principalAmount))).toBeCloseTo(P, 0)
      const scheduleTotal = sum(rows.map((r) => r.totalAmount))
      expect(scheduleTotal).toBeCloseTo(terms.totalAmount, 0)
      for (let i = 0; i < n - 1; i++) {
        expect(rows[i].totalAmount).toBe(terms.monthlyPayment)
      }
    })
  })
})
