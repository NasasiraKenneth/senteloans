import { appendSaccoLoanListFilters } from "@/lib/sacco-loans/query-filters"

describe("sacco-loan query filters", () => {
  it("appends loan type and remaining tenure filters", () => {
    const result = appendSaccoLoanListFilters({
      where: "l.institution_id = $1",
      params: ["inst-1"],
      idx: 2,
      loanType: "top_up",
      remainingTenure: "lte6",
      q: "acme",
    })

    expect(result.where).toContain("lower(l.loan_type)")
    expect(result.where).toContain("COALESCE(l.remaining_tenure_months, l.tenure_months) <= 6")
    expect(result.params).toEqual(["inst-1", "top_up", "%acme%"])
    expect(result.idx).toBe(4)
  })
})
