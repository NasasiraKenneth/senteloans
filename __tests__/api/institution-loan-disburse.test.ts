import { POST as POST_DISBURSE } from "@/app/api/institution/loans/[id]/disburse/route"
import { mockNextRequest } from "@/__tests__/utils/api-test-helpers"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn((fn) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
}))

jest.mock("@/lib/email/loan-emails", () => ({
  enqueueLoanStatusEmails: jest.fn().mockResolvedValue({ enqueued: [], skipped: [], errors: [] }),
}))

jest.mock("@/lib/notifications/loan-events", () => ({
  notifyLoanStatusChanged: jest.fn().mockResolvedValue({ ok: true, memberNotifications: 0, staffNotifications: 0, errors: [] }),
}))

jest.mock("@/lib/api/rbac", () => ({
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

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
} from "@/lib/api/rbac"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { settlePaymentByMode } from "@/lib/finances/settle-payment-mode"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
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

const actor = {
  id: STAFF_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  role_id: "role-1",
  role: "manager",
}

function setupAuth() {
  getServerSessionMock.mockResolvedValue({
    user: { authUserId: AUTH_USER_ID, type: "staff" },
  })
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission === "disburse_loan")
  createTransactionMock.mockResolvedValue({ id: "txn-disburse-1" })
  settlePaymentByModeMock.mockResolvedValue(undefined)
}

function mockPgClient(loanType = "top up", status = "Partially Disbursed") {
  const loan = {
    id: LOAN_ID,
    institution_id: INSTITUTION_ID,
    branch_id: BRANCH_ID,
    member_id: MEMBER_ID,
    application_id: "LN-TOP-002",
    status,
    approved_at: "2026-06-01",
    total_amount: 12000,
    principal_amount: 10000,
    interest_rate: 12,
    tenure_months: 12,
    loan_product_id: "product-1",
    loan_type: loanType,
    disbursement_balance: 6500,
  }

  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] }
      }
      if (/FROM users WHERE id/.test(sql)) {
        return { rows: [{ id: STAFF_ID, institution_id: INSTITUTION_ID, branch_id: BRANCH_ID }] }
      }
      if (/FROM loans/.test(sql) && params?.[0] === LOAN_ID && /disbursement_balance/.test(sql)) {
        return { rows: [loan] }
      }
      if (/FROM loans l/.test(sql) && /LEFT JOIN members/.test(sql)) {
        return {
          rows: [
            {
              application_id: loan.application_id,
              principal_amount: loan.principal_amount,
              loan_type: loan.loan_type,
              product_name: "Standard Loan",
              member_id: MEMBER_ID,
              full_name: "Jane Doe",
              member_number: "M-001",
              email: "jane@example.com",
            },
          ],
        }
      }
      if (/FROM loans l/.test(sql) && /interest_calculation_method/.test(sql)) {
        return {
          rows: [
            {
              principal_amount: loan.principal_amount,
              interest_rate: loan.interest_rate,
              tenure_months: loan.tenure_months,
              disbursement_date: "2026-06-17",
              interest_calculation_method: "reducing_balance",
            },
          ],
        }
      }
      if (/FROM loan_settlements/.test(sql)) {
        return {
          rows: [
            {
              settlement_amount: 3000,
              settlement_status: status === "Approved" ? "Pending" : "Completed",
              disbursement_id: status === "Approved" ? null : "disb-settlement-1",
            },
          ],
        }
      }
      if (/FROM loan_products/.test(sql)) {
        return { rows: [{ processing_fee_percentage: 2, interest_calculation_method: "reducing_balance" }] }
      }
      if (/INSERT INTO loan_disbursements/.test(sql)) {
        return { rows: [{ id: "disb-member-1" }] }
      }
      if (/INSERT INTO loan_repayments/.test(sql) || /UPDATE loans/.test(sql)) {
        return { rows: [] }
      }
      if (/FROM config/.test(sql)) {
        return { rows: [{ currency: "UGX" }] }
      }
      if (/FROM institutions/.test(sql)) {
        return { rows: [{ name: "Test SACCO" }] }
      }
      return { rows: [] }
    }),
  }
  return client
}

describe("POST /api/institution/loans/[id]/disburse", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("rejects top-up disburse before settlement is completed", async () => {
    const client = mockPgClient("top up", "Approved")
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn(client))

    const res = await POST_DISBURSE(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/disburse`, {
        method: "POST",
        body: {
          disbursement_type: "complete",
          disbursement_amount: 6500,
          disbursement_mode: "Cash",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("settlement_not_completed")
    expect(client.query.mock.calls.some(([sql]) => sql === "BEGIN")).toBe(false)
  })

  it("disburses remaining member balance for top-up after settlement", async () => {
    const client = mockPgClient("top up", "Partially Disbursed")
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn(client))

    const res = await POST_DISBURSE(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/disburse`, {
        method: "POST",
        body: {
          disbursement_type: "complete",
          disbursement_amount: 6500,
          disbursement_mode: "Cash",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(res.status).toBe(200)
    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "Loan Disbursement",
        amount: 6500,
        description: expect.stringContaining("Member loan disbursement"),
      }),
    )
    expect(settlePaymentByModeMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ flow: "outflow", amount: 6500 }),
    )
  })

  it("disburses remaining member balance for buy-off after settlement", async () => {
    const client = mockPgClient("buy off", "Partially Disbursed")
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn(client))

    const res = await POST_DISBURSE(
      mockNextRequest(`http://localhost/api/institution/loans/${LOAN_ID}/disburse`, {
        method: "POST",
        body: {
          disbursement_type: "complete",
          disbursement_amount: 6500,
          disbursement_mode: "Cash",
        },
      }),
      { params: Promise.resolve({ id: LOAN_ID }) },
    )

    expect(res.status).toBe(200)
    expect(settlePaymentByModeMock).toHaveBeenCalled()
  })
})
