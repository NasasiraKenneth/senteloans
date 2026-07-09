import {
  createExpense,
  createExpenseCashflow,
  createExpenseFundingSource,
  createExpensePayment,
  EXPENSE_FUNDING_SOURCE_TYPES,
  isExpenseFundingSourceType,
} from "@/lib/expenses/create-expense"

function mockClient() {
  const queries: Array<{ sql: string; values: unknown[] }> = []
  const client = {
    query: jest.fn(async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values: values ?? [] })
      if (sql.includes("INSERT INTO expenses")) {
        return {
          rows: [
            {
              id: "exp-1",
              expense_number: values?.[2] ?? "EXP-0001",
              name: values?.[3],
              status: values?.[4],
              type: values?.[5],
              description: values?.[6],
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }
      }
      if (sql.includes("INSERT INTO expense_funding_sources")) {
        return {
          rows: [
            {
              id: "fund-1",
              expense_id: values?.[0],
              source_type: values?.[1],
              loan_id: values?.[2],
              amount: values?.[3],
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }
      }
      if (sql.includes("INSERT INTO expense_cashflows_payments")) {
        return {
          rows: [
            {
              id: "pay-1",
              expense_id: values?.[0],
              transaction_id: values?.[1],
              expense_cashflow_id: values?.[2],
              payment_method: values?.[3],
              amount: values?.[4],
              date: values?.[5],
              created_by: values?.[6],
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }
      }
      if (sql.includes("INSERT INTO expense_cashflows")) {
        return {
          rows: [
            {
              id: "cf-1",
              expense_id: values?.[0],
              amount: values?.[5],
              description: values?.[6],
              status: values?.[7],
              date: values?.[8],
              payment_method: values?.[4],
              staff_id: values?.[2],
              third_party_agent_id: values?.[3],
              transaction_id: values?.[1],
              completed_by: values?.[9],
              completed_at: values?.[10],
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }
      }
      return { rows: [] }
    }),
    queries,
  }
  return client
}

describe("create-expense helpers", () => {
  it("recognizes valid funding source types", () => {
    for (const t of EXPENSE_FUNDING_SOURCE_TYPES) {
      expect(isExpenseFundingSourceType(t)).toBe(true)
    }
    expect(isExpenseFundingSourceType("invalid")).toBe(false)
  })

  it("inserts expenses without category_id", async () => {
    const client = mockClient()
    const created = await createExpense(
      client as never,
      {
        institutionId: "inst-1",
        branchId: "branch-1",
        createdBy: "user-1",
        name: "Office supplies",
        type: "Short-term",
        description: "Pens and paper",
        expenseNumber: "EXP-TEST-1",
      },
      { audit: false },
    )

    expect(created.id).toBe("exp-1")
    expect(created.expenseNumber).toBe("EXP-TEST-1")
    expect(client.queries[0].sql).not.toContain("category_id")
    expect(client.queries[0].values).toEqual([
      "inst-1",
      "branch-1",
      "EXP-TEST-1",
      "Office supplies",
      "Pending",
      "Short-term",
      "Pens and paper",
      "user-1",
      null,
      null,
    ])
  })

  it("inserts funding sources with loan_id only for loan type", async () => {
    const client = mockClient()
    await createExpenseFundingSource(
      client as never,
      { expenseId: "exp-1", sourceType: "savings", amount: 100, loanId: "loan-1" },
      { audit: false },
    )
    expect(client.queries[0].values[2]).toBeNull()

    const client2 = mockClient()
    await createExpenseFundingSource(
      client2 as never,
      { expenseId: "exp-1", sourceType: "loan", amount: 500, loanId: "loan-1" },
      { audit: false },
    )
    expect(client2.queries[0].values[2]).toBe("loan-1")
  })

  it("inserts cashflows with third_party_agent_id", async () => {
    const client = mockClient()
    const created = await createExpenseCashflow(
      client as never,
      {
        expenseId: "exp-1",
        amount: 250,
        date: "2026-06-17",
        thirdPartyAgentId: "agent-1",
        paymentMethod: "Cash",
        description: "Vendor payment",
      },
      { audit: false },
    )

    expect(created.thirdPartyAgentId).toBe("agent-1")
    expect(client.queries[0].sql).toContain("third_party_agent_id")
    expect(client.queries[0].sql).not.toContain("client_id")
  })

  it("inserts expense_cashflows_payments rows", async () => {
    const client = mockClient()
    const created = await createExpensePayment(
      client as never,
      {
        expenseId: "exp-1",
        expenseCashflowId: "cf-1",
        transactionId: "tx-1",
        amount: 1500,
        paymentMethod: "Bank Transfer",
        date: "2026-06-17",
        createdBy: "user-1",
      },
      { audit: false },
    )

    expect(created.id).toBe("pay-1")
    expect(created.expenseCashflowId).toBe("cf-1")
    expect(created.transactionId).toBe("tx-1")
    expect(created.amount).toBe(1500)
    expect(client.queries[0].sql).toContain("INSERT INTO expense_cashflows_payments")
    expect(client.queries[0].values).toEqual([
      "exp-1",
      "tx-1",
      "cf-1",
      "Bank Transfer",
      1500,
      "2026-06-17",
      "user-1",
    ])
  })
})
