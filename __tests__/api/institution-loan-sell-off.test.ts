import { POST as POST_SELL_OFF } from "@/app/api/institution/loans/[id]/sell-off/route"
import { mockNextRequest } from "@/__tests__/utils/api-test-helpers"

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn((fn) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
}))

jest.mock("@/lib/email/loan-payment-emails", () => ({
  enqueueLoanPaymentReceivedEmails: jest.fn().mockResolvedValue({ enqueued: [], skipped: [], errors: [] }),
}))

jest.mock("@/lib/api/rbac", () => ({
  requireStaffSession: jest.fn(),
  resolveActorContext: jest.fn(),
  hasPermission: jest.fn(),
  assertNotSuperAdmin: jest.fn(),
  isSuperAdmin: jest.fn(() => false),
}))

jest.mock("@/lib/staff/staff-status", () => ({
  assertActorActive: jest.fn().mockResolvedValue({ ok: true }),
}))

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn().mockResolvedValue({ ok: true }),
}))

jest.mock("@/lib/transactions/create-transaction", () => ({
  createTransaction: jest.fn(),
}))

jest.mock("@/lib/finances/settle-payment-mode", () => {
  const actual = jest.requireActual("@/lib/finances/settle-payment-mode")
  return {
    ...actual,
    settlePaymentByMode: jest.fn(),
  }
})

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: {
    create: jest.fn().mockResolvedValue({ ok: true }),
  },
}))

import { runWithAuth } from "@/lib/db"
import {
  assertNotSuperAdmin,
  hasPermission,
  requireStaffSession,
  resolveActorContext,
} from "@/lib/api/rbac"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { settlePaymentByMode } from "@/lib/finances/settle-payment-mode"

const runWithAuthMock = runWithAuth as jest.Mock
const requireStaffSessionMock = requireStaffSession as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const createTransactionMock = createTransaction as jest.Mock
const settlePaymentByModeMock = settlePaymentByMode as jest.Mock

const LOAN_ID = "33333333-3333-3333-3333-333333333333"
const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
const MEMBER_ID = "44444444-4444-4444-4444-444444444444"
const LENDER_ID = "66666666-6666-4666-8666-666666666666"
const AUTH_USER_ID = "auth-user-1"
const STAFF_ID = "staff-1"
const REPAYMENT_ID = "55555555-5555-5555-5555-555555555555"

const actor = {
  id: STAFF_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  role_id: "role-1",
  role: "manager",
}

const activeLoan = {
  id: LOAN_ID,
  application_id: "LN-TEST-001",
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  member_id: MEMBER_ID,
  outstanding_balance: 5000,
  status: "Active",
}

const unpaidRepayment = {
  id: REPAYMENT_ID,
  total_amount: "5000",
  penalty_amount: "0",
  amount_due: "5000",
  amount_paid: "0",
  status: "Pending",
}

function setupAuth() {
  requireStaffSessionMock.mockResolvedValue({ ok: true, authUserId: AUTH_USER_ID })
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission === "sell_loan")
}

function mockPgClient() {
  const queries: string[] = []
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql)
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] }
      }
      if (/FROM loans/.test(sql) && params?.[0] === LOAN_ID) {
        return { rows: [activeLoan] }
      }
      if (/FROM third_party_agents/.test(sql)) {
        return { rows: [{ id: LENDER_ID, name: "External Bank Ltd" }] }
      }
      if (/FROM loan_repayments WHERE loan_id/.test(sql) && /status != 'Paid'/.test(sql)) {
        return { rows: [unpaidRepayment] }
      }
      if (/UPDATE loan_repayments/.test(sql)) {
        return { rows: [] }
      }
      if (/UPDATE loans/.test(sql)) {
        return { rows: [] }
      }
      if (/INSERT INTO loan_settlements/.test(sql)) {
        return { rows: [{ id: "settlement-1" }] }
      }
      if (/FROM members m/.test(sql)) {
        return { rows: [{ full_name: "Jane Doe", member_number: "M-001", email: "jane@example.com" }] }
      }
      if (/FROM institutions/.test(sql)) {
        return { rows: [{ name: "Test SACCO" }] }
      }
      if (/FROM config/.test(sql)) {
        return { rows: [{ currency: "UGX" }] }
      }
      return { rows: [] }
    }),
    queries,
  }
  return client
}

describe("POST /api/institution/loans/[id]/sell-off", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
    settlePaymentByModeMock.mockResolvedValue({ bankAccount: null, mode: "Cash" })
    createTransactionMock.mockResolvedValue({ id: "tx-1", transactionNumber: "TXN-0001" })
  })

  it("returns 400 when amount is below outstanding balance", async () => {
    const client = mockPgClient()
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof client) => unknown) => fn(client))

    const response = await POST_SELL_OFF(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/sell-off`, {
        method: "POST",
        body: {
          external_lender_id: LENDER_ID,
          amount: 4000,
          payment_date: "2026-06-17",
          mode: "Cash",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("amount_below_outstanding_balance")
    expect(client.queries.some((sql) => sql === "BEGIN")).toBe(false)
  })

  it("settles finance, creates transaction, and commits inside a DB transaction", async () => {
    const client = mockPgClient()
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof client) => unknown) => fn(client))

    const response = await POST_SELL_OFF(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/sell-off`, {
        method: "POST",
        body: {
          external_lender_id: LENDER_ID,
          amount: 5000,
          payment_date: "2026-06-17",
          mode: "Cash",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.transaction_id).toBe("tx-1")

    expect(client.queries.some((sql) => sql === "BEGIN")).toBe(true)
    expect(client.queries.some((sql) => sql === "COMMIT")).toBe(true)
    expect(settlePaymentByModeMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        amount: 5000,
        mode: "Cash",
        flow: "inflow",
        institutionId: INSTITUTION_ID,
        branchId: BRANCH_ID,
      }),
    )
    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "Loan Repayment",
        amount: 5000,
        description: "Loan sell-off - LN-TEST-001",
        loanId: LOAN_ID,
        prefix: "TXN",
      }),
    )
  })
})
