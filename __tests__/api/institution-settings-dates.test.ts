import { GET, PUT } from "@/app/api/institution/settings/route"
import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
}))

describe("Institution Settings API Date Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { authUserId: "auth-123", type: "staff" },
    })
  })

  it("returns formatted financial_year_start and financial_year_end when DB yields Date objects", async () => {
    const mockDbRow = {
      id: "config-1",
      branch_id: "branch-1",
      currency: "UGX",
      currency_inwords: "Ugandan shillings only",
      share_value: 10000,
      minimum_shares: 5,
      membership_fee: 20000,
      maximum_parallel_loans: 2,
      financial_year: "2026",
      financial_year_start: new Date("2026-01-01T00:00:00.000Z"),
      financial_year_end: new Date("2026-12-31T00:00:00.000Z"),
      new_member_bill_prev_months: true,
      loans: "true",
      shares: "true",
      savings: "true",
      mobile_money: "false",
      chats: "false",
    }

    ;(runWithAuth as jest.Mock).mockImplementation(async (authUserId, callback) => {
      const client = {
        query: jest.fn().mockImplementation((query: string) => {
          if (query.includes("FROM users")) {
            return Promise.resolve({
              rows: [
                {
                  user_id: "user-1",
                  branch_id: "branch-1",
                  id: "inst-1",
                  name: "Test Sacco",
                  type: "SACCO",
                  logo: null,
                },
              ],
            })
          }
          if (query.includes("FROM config")) {
            return Promise.resolve({
              rows: [mockDbRow],
            })
          }
          return Promise.resolve({ rows: [] })
        }),
      }
      return callback(client)
    })

    const req = new Request("http://localhost:3000/api/institution/settings")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.config.financialYear).toBe("2026")
    expect(data.config.financialYearStart).toBe("2026-01-01")
    expect(data.config.financialYearEnd).toBe("2026-12-31")
    expect(data.config.newMemberBillPrevMonths).toBe(true)
  })
})
