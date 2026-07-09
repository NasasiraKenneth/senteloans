import { POST as POST_SETTLE_PREVIOUS } from "@/app/api/institution/loans/[id]/settle-previous/route"
import { mockNextRequest } from "@/__tests__/utils/api-test-helpers"

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
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

jest.mock("@/lib/loans/apply-loan-payment-in-transaction", () => ({
  applyLoanPaymentInTransaction: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
    logInsert: jest.fn().mockResolvedValue(undefined),
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
import { applyLoanPaymentInTransaction } from "@/lib/loans/apply-loan-payment-in-transaction"

const runWithAuthMock = runWithAuth as jest.Mock
const requireStaffSessionMock = requireStaffSession as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const createTransactionMock = createTransaction as jest.Mock
const settlePaymentByModeMock = settlePaymentByMode as jest.Mock
const applyLoanPaymentInTransactionMock = applyLoanPaymentInTransaction as jest.Mock

const NEW_LOAN_ID = "33333333-3333-3333-3333-333333333333"
const PREV_LOAN_ID = "44444444-4444-4444-4444-444444444444"
const LENDER_ID = "77777777-7777-4777-8777-777777777777"
const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
const MEMBER_ID = "55555555-5555-5555-5555-555555555555"
const SETTLEMENT_ID = "66666666-6666-4666-8666-666666666666"
const AUTH_USER_ID = "auth-user-1"
const STAFF_ID = "staff-1"

const actor = {
  id: STAFF_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  role_id: "role-1",
  role: "manager",
}

const approvedTopUpLoan = {
  id: NEW_LOAN_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  member_id: MEMBER_ID,
  application_id: "LN-TOP-001",
  loan_product_id: "product-1",
  principal_amount: 10000,
  status: "Approved",
  loan_type: "top up",
}

const previousLoan = {
  id: PREV_LOAN_ID,
  application_id: "LN-OLD-001",
  outstanding_balance: 3000,
  status: "Active",
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  member_id: MEMBER_ID,
}

function setupAuth() {
  requireStaffSessionMock.mockResolvedValue({ ok: true, authUserId: AUTH_USER_ID })
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission === "disburse_loan")
  createTransactionMock.mockResolvedValue({ id: "txn-settlement-1" })
  settlePaymentByModeMock.mockResolvedValue(undefined)
  applyLoanPaymentInTransactionMock.mockResolvedValue({
    ok: true,
    transactionId: "txn-repay-1",
    amountApplied: 3000,
    balanceAfter: 0,
  })
}

function mockPgClient(loanType = "top up") {
  const loan = { ...approvedTopUpLoan, loan_type: loanType }
  const settlement =
    loanType === "buy off"
      ? {
          id: SETTLEMENT_ID,
          settled_loan_id: null,
          external_lender_id: LENDER_ID,
          settlement_amount: 3000,
          settlement_status: "Pending",
          disbursement_id: null,
        }
      : {
          id: SETTLEMENT_ID,
          settled_loan_id: PREV_LOAN_ID,
          external_lender_id: null,
          settlement_amount: 3000,
          settlement_status: "Pending",
          disbursement_id: null,
        }

  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] }
      }
      if (/FROM loans/.test(sql) && params?.[0] === NEW_LOAN_ID && /application_id/.test(sql)) {
        return { rows: [loan] }
      }
      if (/FROM loans/.test(sql) && params?.[0] === PREV_LOAN_ID) {
        return { rows: [previousLoan] }
      }
      if (/FROM loan_settlements/.test(sql)) {
        return { rows: [settlement] }
      }
      if (/FROM third_party_agents/.test(sql)) {
        return { rows: [{ id: LENDER_ID, name: "External Bank Ltd" }] }
      }
      if (/FROM loan_products/.test(sql)) {
        return { rows: [{ processing_fee_percentage: 2 }] }
      }
      if (/INSERT INTO loan_disbursements/.test(sql)) {
        return { rows: [{ id: "disb-1" }] }
      }
      if (/UPDATE loan_settlements/.test(sql) || /UPDATE loans/.test(sql) || /INSERT INTO audit_logs/.test(sql)) {
        return { rows: [] }
      }
      return { rows: [] }
    }),
  }
  return client
}

describe("POST /api/institution/loans/[id]/settle-previous", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("rejects when reference number is required for non-cash mode", async () => {
    const req = mockNextRequest(`http://localhost/api/institution/loans/${NEW_LOAN_ID}/settle-previous`, {
      method: "POST",
      body: { mode: "Mobile Money" },
    })
    const res = await POST_SETTLE_PREVIOUS(req, { params: Promise.resolve({ id: NEW_LOAN_ID }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("reference_number_required")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("settles top-up internally without daily finance but updates previous loan repayments", async () => {
    const client = mockPgClient("top up")
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn(client))

    const req = mockNextRequest(`http://localhost/api/institution/loans/${NEW_LOAN_ID}/settle-previous`, {
      method: "POST",
      body: {
        mode: "Cash",
        payment_date: "2026-06-17",
      },
    })
    const res = await POST_SETTLE_PREVIOUS(req, { params: Promise.resolve({ id: NEW_LOAN_ID }) })
    expect(res.status).toBe(201)

    const beginIdx = client.query.mock.calls.findIndex(([sql]) => sql === "BEGIN")
    const commitIdx = client.query.mock.calls.findIndex(([sql]) => sql === "COMMIT")
    expect(beginIdx).toBeGreaterThanOrEqual(0)
    expect(commitIdx).toBeGreaterThan(beginIdx)

    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "Loan Disbursement",
        amount: 3000,
        mode: "Cash",
      }),
    )
    expect(settlePaymentByModeMock).not.toHaveBeenCalled()
    expect(applyLoanPaymentInTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        loanId: PREV_LOAN_ID,
        amount: 3000,
        mode: "Cash",
        skipFinanceSettlement: true,
        forceFullClose: true,
      }),
    )
  })

  it("settles buy-off with transaction and daily finance outflow", async () => {
    const client = mockPgClient("buy off")
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn(client))

    const req = mockNextRequest(`http://localhost/api/institution/loans/${NEW_LOAN_ID}/settle-previous`, {
      method: "POST",
      body: { mode: "Cash" },
    })
    const res = await POST_SETTLE_PREVIOUS(req, { params: Promise.resolve({ id: NEW_LOAN_ID }) })
    expect(res.status).toBe(201)

    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "Loan Disbursement",
        amount: 3000,
        description: expect.stringContaining("Buy-off settlement"),
      }),
    )
    expect(applyLoanPaymentInTransactionMock).not.toHaveBeenCalled()
    expect(settlePaymentByModeMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ flow: "outflow", amount: 3000 }),
    )
  })
})
