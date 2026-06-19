import { GET as GET_SHARES } from "@/app/api/client/shares/route"
import { GET as GET_LOAN_PRODUCTS } from "@/app/api/client/loan-products/route"
import { GET as GET_LOANS, POST as POST_LOAN } from "@/app/api/client/loans/route"

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

jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: {
    createBulk: jest.fn().mockResolvedValue({ ok: true, count: 1 }),
    create: jest.fn().mockResolvedValue({ ok: true }),
  },
}))

jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionAdminRecipients: jest.fn().mockResolvedValue([]),
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import {
  clientSession,
  createPgMock,
  defaultMemberRow,
  INSTITUTION_ID,
  MEMBER_ID,
  normalizeSql,
} from "../utils/client-api-test-helpers"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock

function setupPg(pg = createPgMock()) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof pg) => unknown) => fn(pg))
  return pg
}

describe("GET /api/client/shares", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_SHARES()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const response = await GET_SHARES()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("fetches client shares summary and history", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from member_shares")) {
            return {
              rows: [
                {
                  id: "share-1",
                  number_of_shares: 10,
                  share_value: 10000,
                  total_value: 100000,
                  purchase_date: "2024-01-01",
                },
                {
                  id: "share-2",
                  number_of_shares: 5,
                  share_value: 10000,
                  total_value: 50000,
                  purchase_date: "2024-02-01",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const response = await GET_SHARES()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.history).toHaveLength(2)
    expect(body.totals.units).toBe(15)
    expect(body.totals.totalValue).toBe(150000)
  })
})

describe("GET /api/client/loan-products", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_LOAN_PRODUCTS()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const response = await GET_LOAN_PRODUCTS()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("fetches available loan products", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from loan_products")) {
            return {
              rows: [
                {
                  id: "prod-1",
                  product_name: "Personal Loan",
                  description: "Quick personal loan",
                  interest_rate: 15.5,
                  minimum_amount: 100000,
                  maximum_amount: 5000000,
                  minimum_tenure_months: 3,
                  maximum_tenure_months: 24,
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const response = await GET_LOAN_PRODUCTS()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.products).toHaveLength(1)
    expect(body.products[0].name).toBe("Personal Loan")
  })
})

describe("GET /api/client/loans", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_LOANS()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("lists client loans", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from loans where member_id")) {
            return {
              rows: [
                {
                  id: "loan-1",
                  application_id: "LA-20240101-000001",
                  principal_amount: 1000000,
                  interest_rate: 15.5,
                  tenure_months: 12,
                  outstanding_balance: 1000000,
                  status: "Applied",
                  next_payment_date: null,
                  loan_product_id: "prod-1",
                  application_date: "2024-01-01",
                },
              ],
            }
          }
          if (s.includes("from loan_products where id = any")) {
            return { rows: [{ id: "prod-1", product_name: "Personal Loan" }] }
          }
          return undefined
        },
      }),
    )

    const response = await GET_LOANS()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.loans).toHaveLength(1)
    expect(body.loans[0].applicationId).toBe("LA-20240101-000001")
  })
})

describe("POST /api/client/loans", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/loans", {
      method: "POST",
      body: JSON.stringify({
        loan_product_id: "prod-1",
        principal_amount: 1000000,
        tenure_months: 12,
        purpose: "Business expansion",
        monthly_income: 500000,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_LOAN(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 400 if member is not active", async () => {
    setupPg(
      createPgMock({
        member: { ...defaultMemberRow, status: "Inactive" },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/loans", {
      method: "POST",
      body: JSON.stringify({
        loan_product_id: "prod-1",
        principal_amount: 1000000,
        tenure_months: 12,
        purpose: "Business expansion",
        monthly_income: 500000,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_LOAN(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("not active")
  })

  it("returns 400 if KYC is not verified", async () => {
    setupPg(
      createPgMock({
        member: { ...defaultMemberRow, kyc_status: "Pending" },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/loans", {
      method: "POST",
      body: JSON.stringify({
        loan_product_id: "prod-1",
        principal_amount: 1000000,
        tenure_months: 12,
        purpose: "Business expansion",
        monthly_income: 500000,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_LOAN(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("KYC verification required")
  })

  it("returns 400 for missing required fields", async () => {
    setupPg()

    const request = new Request("http://localhost:3000/api/client/loans", {
      method: "POST",
      body: JSON.stringify({
        principal_amount: 1000000,
        tenure_months: 12,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_LOAN(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Loan product is required")
  })

  it("creates loan application", async () => {
    setupPg(
      createPgMock({
        institution: { id: INSTITUTION_ID, type: "MFI" },
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from loan_products where id = $1")) {
            return {
              rows: [
                {
                  id: "prod-1",
                  product_name: "Personal Loan",
                  interest_rate: 15.5,
                  interest_calculation_method: "reducing_balance",
                  minimum_amount: 100000,
                  maximum_amount: 5000000,
                  minimum_tenure_months: 3,
                  maximum_tenure_months: 24,
                  institution_id: INSTITUTION_ID,
                },
              ],
            }
          }
          if (s.includes("insert into loans")) {
            return { rows: [{ id: "loan-123", application_id: "LA-20240101-000001" }] }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/loans", {
      method: "POST",
      body: JSON.stringify({
        loan_product_id: "prod-1",
        principal_amount: 1000000,
        tenure_months: 12,
        purpose: "Business expansion for my shop",
        monthly_income: 500000,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_LOAN(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.loanId).toBe("loan-123")
    expect(body.applicationId).toBe("LA-20240101-000001")
  })
})
