import { POST as POST_RECORD_PAYMENT } from "@/app/api/institution/loans/[id]/record-payment/route"
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
  normalizeRole: jest.fn(() => "manager"),
  SUPER_ADMIN_WRITE_BLOCKED: "super_admin_write_blocked",
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
  outstanding_balance: 10000,
  status: "Active",
  principal_amount: 10000,
  interest_rate: 12,
  tenure_months: 12,
  disbursement_date: "2026-01-01",
  interest_calculation_method: "reducing_balance",
}

const unpaidRepayment = {
  id: REPAYMENT_ID,
  installment_number: 1,
  due_date: "2026-02-01",
  total_amount: "1000",
  penalty_amount: "0",
  amount_due: "1000",
  amount_paid: "0",
  status: "Pending",
}

function setupAuth() {
  requireStaffSessionMock.mockResolvedValue({ ok: true, authUserId: AUTH_USER_ID })
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission === "record_payment")
}

function mockPgClient() {
  const queries: string[] = []
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql)
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] }
      }
      if (/FROM loans l/.test(sql) && params?.[0] === LOAN_ID) {
        return { rows: [activeLoan] }
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
      if (/FROM loan_repayments WHERE loan_id/.test(sql) && /status != 'Paid'/.test(sql)) {
        return { rows: [unpaidRepayment] }
      }
      if (/UPDATE loan_repayments/.test(sql)) {
        return { rows: [] }
      }
      if (/UPDATE loans SET outstanding_balance/.test(sql)) {
        return { rows: [] }
      }
      if (/SELECT due_date FROM loan_repayments/.test(sql)) {
        return { rows: [{ due_date: "2026-03-01" }] }
      }
      if (/COUNT\(\*\)::int AS remaining_installments/.test(sql)) {
        return { rows: [{ remaining_installments: 11 }] }
      }
      if (/UPDATE loans SET next_payment_date/.test(sql)) {
        return { rows: [] }
      }
      return { rows: [] }
    }),
    queries,
  }
  return client
}

describe("POST /api/institution/loans/[id]/record-payment", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
    settlePaymentByModeMock.mockResolvedValue({ bankAccount: null, mode: "Cash" })
    createTransactionMock.mockResolvedValue({ id: "tx-1", transactionNumber: "LR-0001" })
  })

  it("returns 401 when staff session is missing", async () => {
    requireStaffSessionMock.mockResolvedValue({ ok: false, status: 401, error: "unauthorized" })

    const response = await POST_RECORD_PAYMENT(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/record-payment`, {
        method: "POST",
        body: { amount: 500, payment_date: "2026-06-17", mode: "Cash" },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(401)
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 400 when amount is invalid", async () => {
    const response = await POST_RECORD_PAYMENT(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/record-payment`, {
        method: "POST",
        body: { amount: 0, payment_date: "2026-06-17", mode: "Cash" },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("invalid_amount")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 400 when reference is required for non-cash mode", async () => {
    const response = await POST_RECORD_PAYMENT(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/record-payment`, {
        method: "POST",
        body: { amount: 500, payment_date: "2026-06-17", mode: "Mobile Money" },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("reference_number_required")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("records payment with finance inflow settlement and transaction inside a DB transaction", async () => {
    const client = mockPgClient()
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof client) => unknown) => fn(client))

    const response = await POST_RECORD_PAYMENT(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/record-payment`, {
        method: "POST",
        body: {
          amount: 500,
          payment_date: "2026-06-17",
          mode: "Cash",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.amount_applied).toBe(500)
    expect(body.transaction_id).toBe("tx-1")

    expect(client.queries.some((sql) => sql === "BEGIN")).toBe(true)
    expect(client.queries.some((sql) => sql === "COMMIT")).toBe(true)
    expect(settlePaymentByModeMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        amount: 500,
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
        amount: 500,
        mode: "Cash",
        loanId: LOAN_ID,
        prefix: "TXN",
      }),
    )
  })

  it("passes bank account and reference for bank-routed payments", async () => {
    const client = mockPgClient()
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof client) => unknown) => fn(client))

    const response = await POST_RECORD_PAYMENT(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/record-payment`, {
        method: "POST",
        body: {
          amount: 500,
          payment_date: "2026-06-17",
          mode: "Bank Transfer",
          reference_number: "REF-123",
          bank_account_id: "ba-1",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(response.status).toBe(201)
    expect(settlePaymentByModeMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        mode: "Bank Transfer",
        flow: "inflow",
        bankAccountId: "ba-1",
        referenceNumber: "REF-123",
      }),
    )
    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        bankAccountId: "ba-1",
        referenceNumber: "REF-123",
      }),
    )
  })
})
