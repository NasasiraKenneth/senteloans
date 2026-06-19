import { GET as GET_TRANSACTIONS } from "@/app/api/client/transactions/route"
import { GET as GET_NOTIFICATIONS } from "@/app/api/client/notifications/route"
import { PATCH as PATCH_NOTIFICATION } from "@/app/api/client/notifications/[id]/route"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn(),
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import {
  clientSession,
  createPgMock,
  MEMBER_ID,
  normalizeSql,
} from "../utils/client-api-test-helpers"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock

function setupPg(pg = createPgMock()) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof pg) => unknown) => fn(pg))
  return pg
}

describe("GET /api/client/transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_TRANSACTIONS()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const response = await GET_TRANSACTIONS()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("lists client transactions with aggregates", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from transactions") && s.includes("order by transaction_date")) {
            return {
              rows: [
                {
                  id: "tx-1",
                  transaction_number: "TXN001",
                  type: "Deposit",
                  amount: 100000,
                  mode: "Cash",
                  description: "Savings deposit",
                  balance_after: 100000,
                  transaction_date: "2024-01-01",
                  account_id: "acc-1",
                },
              ],
            }
          }
          if (s.includes("from savings_accounts") && s.includes("sum(total_balance)")) {
            return { rows: [{ total: "100000" }] }
          }
          if (s.includes("from member_shares") && s.includes("sum(total_value)")) {
            return { rows: [{ total: "50000" }] }
          }
          return undefined
        },
      }),
    )

    const response = await GET_TRANSACTIONS()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].transaction_number).toBe("TXN001")
    expect(body.aggregates.totalSavings).toBe(100000)
    expect(body.aggregates.totalShares).toBe(50000)
  })
})

describe("GET /api/client/notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/notifications")
    const response = await GET_NOTIFICATIONS(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if client session has no member id", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { authUserId: "auth-1", type: "client", role: "client" },
    })

    const request = new Request("http://localhost:3000/api/client/notifications")
    const response = await GET_NOTIFICATIONS(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("fetches client notifications with unread count", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from notifications") && s.includes("limit $2")) {
            return {
              rows: [
                {
                  id: "notif-1",
                  type: "loan_approved",
                  title: "Loan Approved",
                  message: "Your loan has been approved",
                  action_url: "/client/loans/loan-123",
                  read: false,
                  created_at: "2024-01-01T10:00:00Z",
                },
                {
                  id: "notif-2",
                  type: "kyc_approved",
                  title: "KYC Approved",
                  message: "Your KYC documents have been approved",
                  action_url: "/client/profile",
                  read: true,
                  created_at: "2024-01-01T09:00:00Z",
                },
              ],
            }
          }
          if (s.includes("count(*)::int as c")) {
            return { rows: [{ c: 1 }] }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/notifications")
    const response = await GET_NOTIFICATIONS(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.notifications).toHaveLength(2)
    expect(body.unreadCount).toBe(1)
  })

  it("respects limit parameter", async () => {
    const pg = setupPg(
      createPgMock({
        onQuery: (sql, params) => {
          const s = normalizeSql(sql)
          if (s.includes("from notifications") && s.includes("limit $2")) {
            expect(params?.[1]).toBe(10)
            return { rows: [] }
          }
          if (s.includes("count(*)::int as c")) {
            return { rows: [{ c: 0 }] }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/notifications?limit=10")
    const response = await GET_NOTIFICATIONS(request)

    expect(response.status).toBe(200)
    expect(pg.query).toHaveBeenCalled()
  })
})

describe("PATCH /api/client/notifications/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/notifications/notif-1", {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PATCH_NOTIFICATION(request, { params: Promise.resolve({ id: "notif-1" }) })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 403 if client session has no member id", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { authUserId: "auth-1", type: "client", role: "client" },
    })

    const request = new Request("http://localhost:3000/api/client/notifications/notif-1", {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PATCH_NOTIFICATION(request, { params: Promise.resolve({ id: "notif-1" }) })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe("client_only")
  })

  it("marks notification as read", async () => {
    const pg = setupPg()

    const request = new Request("http://localhost:3000/api/client/notifications/notif-1", {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PATCH_NOTIFICATION(request, { params: Promise.resolve({ id: "notif-1" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(pg.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE notifications"),
      expect.arrayContaining([true, expect.any(String), "notif-1", MEMBER_ID]),
    )
  })

  it("returns 404 when notification is not found", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("update notifications")) {
            return { rows: [], rowCount: 0 }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/notifications/notif-1", {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PATCH_NOTIFICATION(request, { params: Promise.resolve({ id: "notif-1" }) })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("not_found")
  })
})
