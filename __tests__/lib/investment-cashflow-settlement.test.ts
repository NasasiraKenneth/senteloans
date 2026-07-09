import {
  resolveInvestmentCashflowSettlementFlow,
  resolveInvestmentCashflowTransactionType,
} from "@/lib/investments/investment-cashflow-settlement"

describe("resolveInvestmentCashflowSettlementFlow", () => {
  it("uses inflow for income cashflows", () => {
    expect(resolveInvestmentCashflowSettlementFlow("inflow", "income")).toBe("inflow")
  })

  it("uses inflow for capital outflow (return of capital)", () => {
    expect(resolveInvestmentCashflowSettlementFlow("outflow", "capital")).toBe("inflow")
  })

  it("uses outflow for capital inflow (deploying capital)", () => {
    expect(resolveInvestmentCashflowSettlementFlow("inflow", "capital")).toBe("outflow")
  })

  it("uses outflow for expense outflow", () => {
    expect(resolveInvestmentCashflowSettlementFlow("outflow", "expense")).toBe("outflow")
  })

  it("rejects unsupported combinations", () => {
    expect(() => resolveInvestmentCashflowSettlementFlow("inflow", "expense")).toThrow(
      "unsupported_investment_cashflow_settlement:inflow:expense",
    )
    expect(() => resolveInvestmentCashflowSettlementFlow("outflow", "income")).toThrow(
      "unsupported_investment_cashflow_settlement:outflow:income",
    )
  })
})

describe("resolveInvestmentCashflowTransactionType", () => {
  it("uses Investment Withdrawal for income cashflows", () => {
    expect(resolveInvestmentCashflowTransactionType("inflow", "income")).toBe("Investment Withdrawal")
  })

  it("uses Investment Withdrawal for capital outflow", () => {
    expect(resolveInvestmentCashflowTransactionType("outflow", "capital")).toBe("Investment Withdrawal")
  })

  it("uses Investment Deposit for capital inflow", () => {
    expect(resolveInvestmentCashflowTransactionType("inflow", "capital")).toBe("Investment Deposit")
  })

  it("uses Investment Deposit for expense outflow", () => {
    expect(resolveInvestmentCashflowTransactionType("outflow", "expense")).toBe("Investment Deposit")
  })

  it("rejects unsupported combinations", () => {
    expect(() => resolveInvestmentCashflowTransactionType("inflow", "expense")).toThrow(
      "unsupported_investment_cashflow_transaction:inflow:expense",
    )
    expect(() => resolveInvestmentCashflowTransactionType("outflow", "income")).toThrow(
      "unsupported_investment_cashflow_transaction:outflow:income",
    )
  })
})
