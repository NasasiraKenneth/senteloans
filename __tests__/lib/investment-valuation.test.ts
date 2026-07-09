import { computeInvestmentValuationClosing } from "@/lib/investments/investment-valuation"

describe("computeInvestmentValuationClosing", () => {
  it("adds capital inflow to opening", () => {
    expect(computeInvestmentValuationClosing(1_000_000, "inflow", "capital", 250_000)).toBe(1_250_000)
  })

  it("subtracts capital outflow from opening", () => {
    expect(computeInvestmentValuationClosing(1_000_000, "outflow", "capital", 100_000)).toBe(900_000)
  })

  it("adds adjustment inflow to opening", () => {
    expect(computeInvestmentValuationClosing(1_000_000, "inflow", "adjustment", 50_000)).toBe(1_050_000)
  })

  it("subtracts adjustment outflow from opening", () => {
    expect(computeInvestmentValuationClosing(1_000_000, "outflow", "adjustment", 75_000)).toBe(925_000)
  })

  it("leaves opening unchanged for income and expense", () => {
    expect(computeInvestmentValuationClosing(1_000_000, "inflow", "income", 30_000)).toBe(1_000_000)
    expect(computeInvestmentValuationClosing(1_000_000, "outflow", "expense", 20_000)).toBe(1_000_000)
  })
})
