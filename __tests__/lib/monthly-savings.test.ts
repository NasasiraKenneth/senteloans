import { parseMonthlySavingsInput } from "@/lib/members/monthly-savings"

describe("parseMonthlySavingsInput", () => {
  it("allows null for Voluntary accounts", () => {
    expect(parseMonthlySavingsInput(undefined, "Voluntary")).toEqual({ value: null })
    expect(parseMonthlySavingsInput("", "Voluntary")).toEqual({ value: null })
  })

  it("requires a positive amount for Fixed accounts", () => {
    expect(parseMonthlySavingsInput(undefined, "Fixed")).toEqual({
      value: null,
      error: "monthly_savings_required_for_fixed_account",
    })
    expect(parseMonthlySavingsInput(0, "Fixed")).toEqual({
      value: null,
      error: "monthly_savings_required_for_fixed_account",
    })
  })

  it("accepts a positive amount for Fixed accounts", () => {
    expect(parseMonthlySavingsInput(50_000, "Fixed")).toEqual({ value: 50_000 })
  })

  it("rejects invalid amounts for Voluntary accounts", () => {
    expect(parseMonthlySavingsInput(-1, "Voluntary")).toEqual({
      value: null,
      error: "invalid_monthly_savings",
    })
  })
})
