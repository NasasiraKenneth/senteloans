import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"

jest.mock("@/lib/audit/finances-audit", () => ({
  auditBankAccountUpdate: jest.fn().mockResolvedValue(undefined),
  auditDailyFinanceInsert: jest.fn().mockResolvedValue(undefined),
  auditDailyFinanceUpdate: jest.fn().mockResolvedValue(undefined),
  dailyFinanceSnapshot: (row: Record<string, unknown>) => row,
}))

const actor = { id: "user-1", institution_id: "inst-1", branch_id: "branch-1" }

describe("validatePaymentModeInput", () => {
  it("requires reference for non-cash modes", () => {
    expect(validatePaymentModeInput({ mode: "Bank Transfer", bankAccountId: "ba-1" })).toBe(
      "reference_number_required",
    )
  })

  it("requires bank account for bank-routed modes", () => {
    expect(validatePaymentModeInput({ mode: "Bank Transfer", referenceNumber: "REF-1" })).toBe(
      "bank_account_required",
    )
  })
})

describe("settlePaymentByMode outflow", () => {
  it("debits the selected bank account and refreshes daily finances", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM bank_accounts/.test(sql) && /ba\.id/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: "ba-1",
              bank_name: "Stanbic",
              bank_account_number: "001",
              available_balance: "5000",
              total_amount: "5000",
              branch_id: "branch-1",
            },
          ],
        })
      }
      if (/UPDATE bank_accounts/.test(sql)) {
        return Promise.resolve({ rows: [{ available_balance: "3000", total_amount: "3000" }] })
      }
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "3000" }] })
      }
      if (/FROM daily_finances/.test(sql) && /= CURRENT_DATE/.test(sql)) {
        return Promise.resolve({ rows: [] })
      }
      if (/INSERT INTO daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await settlePaymentByMode({ query } as never, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 2000,
      mode: "Bank Transfer",
      flow: "outflow",
      actor,
      bankAccountId: "ba-1",
      referenceNumber: "REF-1",
    })

    const bankUpdate = calls.find((c) => /UPDATE bank_accounts/.test(c.sql))
    expect(bankUpdate?.params[0]).toBe(-2000)
  })

  it("rejects bank outflow when balance is insufficient", async () => {
    const query = jest.fn((sql: string) => {
      if (/FROM bank_accounts/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: "ba-1",
              available_balance: "100",
              total_amount: "100",
              branch_id: "branch-1",
            },
          ],
        })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await expect(
      settlePaymentByMode({ query } as never, {
        institutionId: "inst-1",
        branchId: "branch-1",
        amount: 500,
        mode: "Bank Transfer",
        flow: "outflow",
        actor,
        bankAccountId: "ba-1",
        referenceNumber: "REF-1",
      }),
    ).rejects.toMatchObject({ code: "insufficient_bank_balance" })
  })

  it("debits cash from daily finances for cash outflow", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM daily_finances/.test(sql) && /= CURRENT_DATE/.test(sql) && /cash_amount/.test(sql)) {
        return Promise.resolve({ rows: [{ cash_amount: "10000", mobile_money_amount: "0" }] })
      }
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "0" }] })
      }
      if (/UPDATE daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await settlePaymentByMode({ query } as never, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 1500,
      mode: "Cash",
      flow: "outflow",
      actor,
    })

    const update = calls.find((c) => /UPDATE daily_finances/.test(c.sql))
    expect(update?.params[2]).toBe(8500)
  })

  it("includes charges in cash outflow settlement", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM daily_finances/.test(sql) && /= CURRENT_DATE/.test(sql) && /cash_amount/.test(sql)) {
        return Promise.resolve({ rows: [{ cash_amount: "10000", mobile_money_amount: "0" }] })
      }
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "0" }] })
      }
      if (/UPDATE daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await settlePaymentByMode({ query } as never, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 1500,
      charges: 50,
      mode: "Cash",
      flow: "outflow",
      actor,
    })

    const update = calls.find((c) => /UPDATE daily_finances/.test(c.sql))
    expect(update?.params[2]).toBe(8450)
  })

  it("includes charges in bank outflow debit", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM bank_accounts/.test(sql) && /ba\.id/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: "ba-1",
              available_balance: "5000",
              total_amount: "5000",
              branch_id: "branch-1",
            },
          ],
        })
      }
      if (/UPDATE bank_accounts/.test(sql)) {
        return Promise.resolve({ rows: [{ available_balance: "2950", total_amount: "2950" }] })
      }
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "2950" }] })
      }
      if (/INSERT INTO daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await settlePaymentByMode({ query } as never, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 2000,
      charges: 50,
      mode: "Bank Transfer",
      flow: "outflow",
      actor,
      bankAccountId: "ba-1",
      referenceNumber: "REF-1",
    })

    const bankUpdate = calls.find((c) => /UPDATE bank_accounts/.test(c.sql))
    expect(bankUpdate?.params[0]).toBe(-2050)
  })

  it("throws PaymentSettlementFailure for validation errors", async () => {
    await expect(
      settlePaymentByMode({ query: jest.fn() } as never, {
        institutionId: "inst-1",
        branchId: "branch-1",
        amount: 100,
        mode: "InvalidMode",
        flow: "outflow",
        actor,
      }),
    ).rejects.toBeInstanceOf(PaymentSettlementFailure)
  })
})

describe("settlePaymentByMode inflow", () => {
  it("credits cash to daily finances for cash inflow", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM daily_finances/.test(sql) && /= CURRENT_DATE/.test(sql) && /cash_amount/.test(sql)) {
        return Promise.resolve({ rows: [{ cash_amount: "5000", mobile_money_amount: "0" }] })
      }
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "0" }] })
      }
      if (/UPDATE daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await settlePaymentByMode({ query } as never, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 1500,
      mode: "Cash",
      flow: "inflow",
      actor,
    })

    const update = calls.find((c) => /UPDATE daily_finances/.test(c.sql))
    expect(update?.params[2]).toBe(6500)
  })

  it("credits the selected bank account for bank inflow", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM bank_accounts/.test(sql) && /ba\.id/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: "ba-1",
              available_balance: "3000",
              total_amount: "3000",
              branch_id: "branch-1",
            },
          ],
        })
      }
      if (/UPDATE bank_accounts/.test(sql)) {
        return Promise.resolve({ rows: [{ available_balance: "5000", total_amount: "5000" }] })
      }
      if (/SUM\(total_amount\)/.test(sql)) {
        return Promise.resolve({ rows: [{ bank_total: "5000" }] })
      }
      if (/INSERT INTO daily_finances/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "df-1", branch_id: "branch-1" }] })
      }
      return Promise.resolve({ rows: [] })
    }) as never

    await settlePaymentByMode({ query } as never, {
      institutionId: "inst-1",
      branchId: "branch-1",
      amount: 2000,
      mode: "Bank Transfer",
      flow: "inflow",
      actor,
      bankAccountId: "ba-1",
      referenceNumber: "REF-1",
    })

    const bankUpdate = calls.find((c) => /UPDATE bank_accounts/.test(c.sql))
    expect(bankUpdate?.params[0]).toBe(2000)
  })
})
