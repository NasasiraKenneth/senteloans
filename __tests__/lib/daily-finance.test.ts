import { channelForMode, applyDailyFinanceEntry } from "@/lib/finances/daily-finance"

// The audit helpers hit auditLogger/db; stub them so we can test the ledger
// maths and the posting-day targeting in isolation.
jest.mock("@/lib/audit/finances-audit", () => ({
  auditDailyFinanceInsert: jest.fn().mockResolvedValue(undefined),
  auditDailyFinanceUpdate: jest.fn().mockResolvedValue(undefined),
  dailyFinanceSnapshot: (row: Record<string, unknown>) => row,
}))

const actor = { id: "user-1", institution_id: "inst-1", branch_id: "branch-1" }

describe("channelForMode", () => {
  it("maps payment modes to channels", () => {
    expect(channelForMode("Mobile Money")).toBe("mobile_money")
    expect(channelForMode("Bank Transfer")).toBe("bank")
    expect(channelForMode("Cheque")).toBe("bank")
    expect(channelForMode("Card")).toBe("bank")
    expect(channelForMode("Cash")).toBe("cash")
    expect(channelForMode("Anything else")).toBe("cash")
  })
})

describe("applyDailyFinanceEntry", () => {
  it("updates today's row (CURRENT_DATE) and increments the cash channel", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "1000" }] })
      }
      if (/FROM daily_finances/.test(sql) && /= CURRENT_DATE/.test(sql)) {
        // Today's row exists.
        return Promise.resolve({
          rows: [
            {
              id: "df-1",
              bank_total_amount: "1000",
              mobile_money_amount: "0",
              cash_amount: "500",
              total_amount: "1500",
              available_balance: "1500",
              branch_id: "branch-1",
            },
          ],
        })
      }
      if (/UPDATE daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as any

    await applyDailyFinanceEntry({ query } as any, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 250,
      mode: "Cash",
      actor,
    })

    const update = calls.find((c) => /UPDATE daily_finances/.test(c.sql))
    expect(update).toBeDefined()
    // newCash = 500 + 250, newMm = 0, newTotal = bank(1000) + 750
    expect(update!.params[2]).toBe(750) // cash_amount
    expect(update!.params[3]).toBe(1750) // total_amount

    // The lookup targets the DB CURRENT_DATE and only binds institution + branch.
    const todayLookup = calls.find(
      (c) => /FROM daily_finances/.test(c.sql) && /= CURRENT_DATE/.test(c.sql),
    )
    expect(todayLookup!.params).toEqual(["inst-1", "branch-1"])
  })

  it("inserts a new row (NOW) carrying forward prior balances when none exists today", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "2000" }] })
      }
      if (/FROM daily_finances/.test(sql) && /= CURRENT_DATE/.test(sql)) {
        return Promise.resolve({ rows: [] }) // no row today
      }
      if (/FROM daily_finances/.test(sql) && /< CURRENT_DATE/.test(sql)) {
        return Promise.resolve({ rows: [{ mobile_money_amount: "300", cash_amount: "700" }] })
      }
      if (/INSERT INTO daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-new", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as any

    await applyDailyFinanceEntry({ query } as any, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 100,
      mode: "Mobile Money",
      actor,
    })

    const insert = calls.find((c) => /INSERT INTO daily_finances/.test(c.sql))
    expect(insert).toBeDefined()
    // carry-forward mm = 300 + 100, cash = 700, total = bank(2000) + 400 + 700
    expect(insert!.params[3]).toBe(400) // mobile_money_amount
    expect(insert!.params[4]).toBe(700) // cash_amount
    expect(insert!.params[5]).toBe(3100) // total_amount
    // created_at uses NOW() (not a bound param), so only 7 params are bound.
    expect(insert!.params).toHaveLength(7)
  })
})
