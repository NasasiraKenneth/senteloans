import { GET as GET_KYC, POST as POST_KYC } from "@/app/api/client/kyc-docs/route"
import { GET as GET_SAVINGS } from "@/app/api/client/savings/route"
import { GET as GET_SAVINGS_BY_ID } from "@/app/api/client/savings/[id]/route"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/kyc-events", () => ({
  notifyKycSubmitted: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("@/lib/email/kyc-emails", () => ({
  enqueueKycSubmittedEmail: jest.fn().mockResolvedValue({ enqueued: [], skipped: [], errors: [] }),
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import {
  clientSession,
  createPgMock,
  defaultMemberRow,
  MEMBER_ID,
  normalizeSql,
} from "../utils/client-api-test-helpers"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock

function setupPg(pg = createPgMock()) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof pg) => unknown) => fn(pg))
  return pg
}

describe("GET /api/client/kyc-docs", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_KYC()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const response = await GET_KYC()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("fetches KYC document status", async () => {
    setupPg(
      createPgMock({
        member: {
          ...defaultMemberRow,
          kyc_status: "Approved",
          national_id_back: null,
        },
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from member_kyc_docs")) {
            return {
              rows: [
                {
                  id: "doc-1",
                  doc_type: "national_id",
                  passport_photo: "https://example.com/passport.jpg",
                  document_front: "https://example.com/id-front.jpg",
                  document_back: "https://example.com/id-back.jpg",
                  status: "verified",
                  rejection_reason: null,
                  created_at: "2024-01-02",
                  reviewed_at: "2024-01-03",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const response = await GET_KYC()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.kycStatus).toBe("Approved")
    expect(body.docs.passport_photo.current_verified?.url).toBe("https://example.com/passport.jpg")
    expect(body.docs.national_id_back.current_verified?.url).toBe("https://example.com/id-back.jpg")
  })
})

describe("POST /api/client/kyc-docs", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/kyc-docs", {
      method: "POST",
      body: JSON.stringify({ docType: "passport_photo", url: "https://example.com/photo.jpg" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 400 for invalid doc type", async () => {
    const request = new Request("http://localhost:3000/api/client/kyc-docs", {
      method: "POST",
      body: JSON.stringify({ docType: "invalid_type", url: "https://example.com/photo.jpg" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("invalid_doc_type")
  })

  it("returns 400 if url is missing", async () => {
    const request = new Request("http://localhost:3000/api/client/kyc-docs", {
      method: "POST",
      body: JSON.stringify({ docType: "passport_photo" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("url_required")
  })

  it("uploads KYC document", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("select id") && s.includes("member_kyc_docs")) {
            return { rows: [] }
          }
          if (s.includes("insert into member_kyc_docs")) {
            return { rows: [{ id: "doc-123", created_at: "2024-01-01" }] }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/kyc-docs", {
      method: "POST",
      body: JSON.stringify({ docType: "passport_photo", url: "https://example.com/photo.jpg" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.pendingId).toBe("doc-123")
  })
})

describe("GET /api/client/savings", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_SAVINGS()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const response = await GET_SAVINGS()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("lists client savings accounts", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from savings_accounts")) {
            return {
              rows: [
                {
                  id: "acc-1",
                  account_number: "SAV001",
                  account_type: "Regular Savings",
                  available_balance: 100000,
                  total_balance: 100000,
                  status: "Active",
                  open_date: "2024-01-01",
                  last_transaction_date: "2024-01-15",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const response = await GET_SAVINGS()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0].account_number).toBe("SAV001")
  })
})

describe("GET /api/client/savings/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/savings/acc-1")
    const response = await GET_SAVINGS_BY_ID(request, { params: Promise.resolve({ id: "acc-1" }) })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("fetches single savings account with transactions", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from savings_accounts where id = $1")) {
            return {
              rows: [
                {
                  id: "acc-1",
                  account_number: "SAV001",
                  account_type: "Regular Savings",
                  available_balance: 100000,
                  total_balance: 100000,
                  status: "Active",
                  open_date: "2024-01-01",
                  last_transaction_date: "2024-01-15",
                },
              ],
            }
          }
          if (s.includes("from transactions where account_id")) {
            return {
              rows: [
                {
                  id: "tx-1",
                  type: "Deposit",
                  amount: 50000,
                  mode: "Cash",
                  description: "Initial deposit",
                  balance_after: 50000,
                  transaction_date: "2024-01-01",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/savings/acc-1")
    const response = await GET_SAVINGS_BY_ID(request, { params: Promise.resolve({ id: "acc-1" }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.account.account_number).toBe("SAV001")
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].type).toBe("Deposit")
  })

  it("returns 404 for non-existent account", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from savings_accounts where id = $1")) {
            return { rows: [] }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/savings/non-existent")
    const response = await GET_SAVINGS_BY_ID(request, { params: Promise.resolve({ id: "non-existent" }) })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("not_found")
  })
})
