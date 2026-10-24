import { DELETE, PUT } from "@/app/api/institution/members/[id]/shares/[shareId]/route"
import {
  SUPER_ADMIN_WRITE_BLOCKED,
  SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
} from "@/lib/api/rbac"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
}))

jest.mock("@/lib/api/rbac", () => {
  const actual = jest.requireActual("@/lib/api/rbac")
  return {
    ...actual,
    resolveActorContext: jest.fn(),
    hasPermission: jest.fn(),
    assertNotSuperAdmin: jest.fn(),
  }
})

jest.mock("@/lib/members/member-status", () => {
  const actual = jest.requireActual("@/lib/members/member-status")
  return {
    ...actual,
    assertMemberAndBranchActive: jest.fn(),
  }
})

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

jest.mock("@/lib/invoices/create-invoice", () => ({
  createInvoiceWithItems: jest.fn(),
}))

jest.mock("@/lib/invoices/invoice-payments", () => ({
  recordInvoicePayment: jest.fn(),
  cancelInvoicePaymentByTransactionId: jest.fn(),
  getInvoicePaidAmount: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import {
  resolveActorContext,
  hasPermission,
  assertNotSuperAdmin,
} from "@/lib/api/rbac"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { createTransaction } from "@/lib/transactions/create-transaction"
import {
  settlePaymentByMode,
  PaymentSettlementFailure,
} from "@/lib/finances/settle-payment-mode"
import { createInvoiceWithItems } from "@/lib/invoices/create-invoice"
import {
  recordInvoicePayment,
  cancelInvoicePaymentByTransactionId,
  getInvoicePaidAmount,
} from "@/lib/invoices/invoice-payments"
import { auditLogger } from "@/lib/audit/audit-logger"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const assertMemberAndBranchActiveMock = assertMemberAndBranchActive as jest.Mock
const createTransactionMock = createTransaction as jest.Mock
const settlePaymentByModeMock = settlePaymentByMode as jest.Mock
const createInvoiceWithItemsMock = createInvoiceWithItems as jest.Mock
const recordInvoicePaymentMock = recordInvoicePayment as jest.Mock
const cancelInvoicePaymentByTransactionIdMock = cancelInvoicePaymentByTransactionId as jest.Mock
const getInvoicePaidAmountMock = getInvoicePaidAmount as jest.Mock
const auditLoggerMock = auditLogger as jest.Mocked<typeof auditLogger>

const MEMBER_ID = "55555555-5555-5555-5555-555555555555"
const SHARE_ID = "77777777-7777-7777-7777-777777777777"
const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
const BANK_ACCOUNT_ID = "44444444-4444-4444-4444-444444444444"
const OLD_TX_ID = "88888888-8888-8888-8888-888888888888"
const NEW_TX_ID = "99999999-9999-9999-9999-999999999999"
const STAFF_ID = "staff-1"

function makeStaffSession() {
  return {
    user: {
      authUserId: "auth-staff-1",
      type: "staff",
    },
  }
}

function makeActorContext(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: STAFF_ID,
    auth_user_id: "auth-staff-1",
    institution_id: INSTITUTION_ID,
    branch_id: BRANCH_ID,
    role_name: "Branch Manager",
    is_super_admin: false,
    ...overrides,
  }
}

describe("Member Shares Edit & Void API (/api/institution/members/[id]/shares/[shareId])", () => {
  let mockClient: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockClient = {
      query: jest.fn().mockImplementation((queryText: string) => {
        if (/BEGIN|COMMIT|ROLLBACK/i.test(queryText)) {
          return Promise.resolve({ rows: [] })
        }
        return Promise.resolve({ rows: [] })
      }),
    }

    runWithAuthMock.mockImplementation(
      async (_authUserId: string, fn: (client: any) => Promise<any>) => fn(mockClient),
    )
    assertNotSuperAdminMock.mockReturnValue({ ok: true })
    assertMemberAndBranchActiveMock.mockResolvedValue({
      ok: true,
      member: {
        id: MEMBER_ID,
        institution_id: INSTITUTION_ID,
        branch_id: BRANCH_ID,
        status: "Active",
      },
    })
    resolveActorContextMock.mockResolvedValue(makeActorContext())
    hasPermissionMock.mockResolvedValue(true)
    cancelInvoicePaymentByTransactionIdMock.mockResolvedValue({ invoiceId: "inv-1", cancelledCount: 1 })
    getInvoicePaidAmountMock.mockResolvedValue(0)
    settlePaymentByModeMock.mockResolvedValue({
      bankAccount: { id: BANK_ACCOUNT_ID, branch_id: BRANCH_ID },
      mode: "Cash",
    })
    createTransactionMock.mockResolvedValue({
      id: NEW_TX_ID,
      transactionNumber: "TXN-NEW-001",
    })
    createInvoiceWithItemsMock.mockResolvedValue({
      id: "inv-2",
      invoice_number: "INV-NEW-001",
      total_amount: 100000,
    })
    recordInvoicePaymentMock.mockResolvedValue({ id: "pmt-1" })
  })

  // =========================================================================
  // 1. AUTHENTICATION & AUTHORIZATION
  // =========================================================================
  describe("Authentication & RBAC", () => {
    it("PUT returns 401 when user is not authenticated", async () => {
      getServerSessionMock.mockResolvedValue(null)
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Unauthorized" })
    })

    it("PUT returns 403 when user is not staff", async () => {
      getServerSessionMock.mockResolvedValue({ user: { authUserId: "client-1", type: "client" } })
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "no_app_user_profile" })
    })

    it("PUT returns 403 when staff lacks edit_shares permission", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      hasPermissionMock.mockResolvedValue(false)
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe("missing_permission:edit_shares")
    })

    it("PUT returns 403 when Super Admin attempts write", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      assertNotSuperAdminMock.mockReturnValue({
        ok: false,
        error: SUPER_ADMIN_WRITE_BLOCKED,
        message: SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
      })
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe(SUPER_ADMIN_WRITE_BLOCKED)
    })

    it("DELETE returns 401 when user is not authenticated", async () => {
      getServerSessionMock.mockResolvedValue(null)
      const req = new Request("http://localhost/api", { method: "DELETE" })
      const res = await DELETE(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: "Unauthorized" })
    })

    it("DELETE returns 403 when staff lacks edit_shares permission", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      hasPermissionMock.mockResolvedValue(false)
      const req = new Request("http://localhost/api", { method: "DELETE" })
      const res = await DELETE(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe("missing_permission:edit_shares")
    })
  })

  // =========================================================================
  // 2. INPUT & PARAMETER VALIDATION
  // =========================================================================
  describe("Input Validation", () => {
    it("PUT returns 400 when member ID is not a valid UUID", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: "invalid-uuid", shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Invalid parameters" })
    })

    it("PUT returns 400 when numberOfShares is negative or not an integer", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: -5 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "invalid_number_of_shares" })
    })

    it("PUT returns 404 when share record is not found", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [] })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(404)
      expect((await res.json()).code).toBe("shares_not_found")
    })

    it("PUT returns 400 when share record is already cancelled", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "cancelled",
                number_of_shares: 5,
                remaining_shares: 0,
              },
            ],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 10 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("share_record_already_cancelled")
    })
  })

  // =========================================================================
  // 3. DOWNSTREAM REDUCTION & HOLDING CONSTRAINTS
  // =========================================================================
  describe("Downstream Reduction & Holding Limits", () => {
    it("PUT rejects with 400 when reduction exceeds remaining shares", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                number_of_shares: 10,
                remaining_shares: 3, // 7 shares already transferred out!
                total_value: 500000,
                share_value: 50000,
                date: "2026-01-15",
                mode: "Cash",
              },
            ],
          })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ shares: "true", share_value: "50000", minimum_shares: 5 }],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      // Trying to reduce from 10 to 2 (reduction of 8), but only 3 remaining!
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 2 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("shares_already_transferred_or_sold")
    })

    it("DELETE rejects with 400 when shares have already been transferred or sold", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                acquisition_type: "purchase",
                number_of_shares: 10,
                remaining_shares: 4, // 6 shares moved already
                total_value: 500000,
              },
            ],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", { method: "DELETE" })
      const res = await DELETE(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("shares_already_transferred_or_sold")
    })

    it("PUT rejects with minimum_shares_X when new total falls below minimum requirement", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                number_of_shares: 10,
                remaining_shares: 10,
                total_value: 500000,
                share_value: 50000,
              },
            ],
          })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ shares: "true", share_value: "50000", minimum_shares: 5 }],
          })
        }
        if (/SELECT COALESCE\(SUM\(number_of_shares\)/i.test(queryText)) {
          return Promise.resolve({ rows: [{ other_shares: 0 }] })
        }
        return Promise.resolve({ rows: [] })
      })

      // Reducing to 3, but minimum requirement is 5!
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 3 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("minimum_shares_5")
    })
  })

  // =========================================================================
  // 4. ELIMINATION VIA PUT (numberOfShares = 0)
  // =========================================================================
  describe("Elimination via Edit (numberOfShares = 0)", () => {
    it("successfully voids record and unrolls financial side-effects via settlePaymentByMode outflow", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                number_of_shares: 5,
                remaining_shares: 5,
                total_value: 250000,
                share_value: 50000,
                transaction_id: OLD_TX_ID,
                mode: "Bank Transfer",
                bank_account_id: BANK_ACCOUNT_ID,
                date: "2026-02-01",
              },
            ],
          })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ shares: "true", share_value: "50000" }],
          })
        }
        if (/SELECT invoice_type/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ invoice_type: "Auto", item_desc: "Share Purchase" }],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ numberOfShares: 0 }),
      })
      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.voided).toBe(true)
      expect(body.settlement).toEqual({
        previousTotalValue: 250000,
        newTotalValue: 0,
        valueDifference: -250000,
        sharesDifference: -5,
      })

      // Verify cancellation of old invoice payment
      expect(cancelInvoicePaymentByTransactionIdMock).toHaveBeenCalledWith(
        mockClient,
        OLD_TX_ID,
        expect.objectContaining({ institutionId: INSTITUTION_ID, branchId: BRANCH_ID }),
      )

      // Verify settlePaymentByMode called with outflow of 250,000 (no negatives!)
      expect(settlePaymentByModeMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          flow: "outflow",
          amount: 250000,
          mode: "Bank Transfer",
          bankAccountId: BANK_ACCOUNT_ID,
        }),
      )

      // Verify audit logging
      expect(auditLoggerMock.logUpdate).toHaveBeenCalledWith(
        "member_shares",
        SHARE_ID,
        expect.objectContaining({ number_of_shares: 5 }),
        expect.objectContaining({ number_of_shares: 0, status: "cancelled" }),
        INSTITUTION_ID,
        STAFF_ID,
        expect.objectContaining({ branch_id: BRANCH_ID }),
        mockClient,
      )
    })
  })

  // =========================================================================
  // 5. SUCCESSFUL PURCHASE EDIT (Cancel & Re-issue & Settlement)
  // =========================================================================
  describe("Successful Purchase Edit (Cancel & Re-issue)", () => {
    it("successfully edits purchase: cancels old tx & invoice, settles replacement via inflow and returns settlement", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                number_of_shares: 10,
                remaining_shares: 10,
                total_value: 500000,
                share_value: 50000,
                transaction_id: OLD_TX_ID,
                mode: "Cash",
                date: "2026-02-01",
              },
            ],
          })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ shares: "true", share_value: "50000", minimum_shares: 5 }],
          })
        }
        if (/SELECT COALESCE\(SUM\(number_of_shares\)/i.test(queryText)) {
          return Promise.resolve({ rows: [{ other_shares: 0 }] })
        }
        if (/SELECT invoice_type/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ invoice_type: "Auto", item_desc: "Share Purchase" }],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      // Edit from 10 to 12 shares (+2 shares, +100,000 value)
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "purchase",
          numberOfShares: 12,
          mode: "Cash",
          paymentDate: "2026-02-05",
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.transaction_id).toBe(NEW_TX_ID)
      expect(body.transaction_number).toBe("TXN-NEW-001")
      expect(body.settlement).toEqual({
        previousTotalValue: 500000,
        newTotalValue: 600000,
        valueDifference: 100000,
        sharesDifference: 2,
        settled: true,
      })

      // Check rollback of old transaction & invoice payment
      expect(cancelInvoicePaymentByTransactionIdMock).toHaveBeenCalledWith(
        mockClient,
        OLD_TX_ID,
        expect.anything(),
      )

      // Check settlePaymentByMode called with outflow (500k rollback) and inflow (600k new)
      expect(settlePaymentByModeMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          flow: "outflow",
          amount: 500000,
          mode: "Cash",
        }),
      )
      expect(settlePaymentByModeMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          flow: "inflow",
          amount: 600000,
          mode: "Cash",
        }),
      )

      // Check creation of replacement transaction for 12 * 50,000 = 600,000
      expect(createTransactionMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          type: "Shares Purchase",
          amount: 600000,
          mode: "Cash",
          processedBy: STAFF_ID,
        }),
      )

      // Check creation and settlement of replacement invoice
      expect(createInvoiceWithItemsMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          invoiceType: "Auto",
          status: "fully paid",
          items: [expect.objectContaining({ quantity: 12, total_price: 600000 })],
        }),
      )
      expect(recordInvoicePaymentMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          invoiceId: "inv-2",
          amount: 600000,
          transactionId: NEW_TX_ID,
        }),
      )

      // Check audit logging
      expect(auditLoggerMock.logUpdate).toHaveBeenCalledWith(
        "member_shares",
        SHARE_ID,
        expect.objectContaining({ number_of_shares: 10 }),
        expect.objectContaining({ number_of_shares: 12, transaction_id: NEW_TX_ID }),
        INSTITUTION_ID,
        STAFF_ID,
        expect.objectContaining({ branch_id: BRANCH_ID }),
        mockClient,
      )
    })

    it("rejects edit when settlePaymentByMode fails with insufficient balance", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                number_of_shares: 10,
                remaining_shares: 10,
                total_value: 500000,
                share_value: 50000,
                transaction_id: OLD_TX_ID,
                mode: "Cash",
                date: "2026-02-01",
              },
            ],
          })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ shares: "true", share_value: "50000", minimum_shares: 5 }],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      settlePaymentByModeMock.mockRejectedValueOnce(
        new PaymentSettlementFailure("insufficient_cash_balance"),
      )

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "purchase",
          numberOfShares: 12,
          mode: "Cash",
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("insufficient_cash_balance")
    })
  })

  // =========================================================================
  // 6. FINANCIAL SETTLEMENT DIFFERENCE IN BUY-OFF EDITS
  // =========================================================================
  describe("Financial Settlement Difference in Buy-Off Edits", () => {
    const BUYER_ACC_ID = "acc-buyer-1"
    const SELLER_ACC_ID = "acc-seller-1"
    const BUY_OFF_SHARE = {
      id: SHARE_ID,
      member_id: MEMBER_ID,
      status: "active",
      acquisition_type: "buy",
      number_of_shares: 5,
      remaining_shares: 5,
      total_value: 250000,
      share_value: 50000,
      mode: "Savings Account",
      date: "2026-02-01",
    }
    const BUY_OFF_MOVE = {
      id: "move-1",
      move_type: "buy_out",
      from_id: "seller-share-id",
      from_member_id: "seller-1",
      from_shares: 5,
      from_remaining: 10,
      to_id: SHARE_ID,
      to_member_id: MEMBER_ID,
      to_shares: 5,
      to_remaining: 5,
      buyer_account_transaction_id: "buyer-tx-1",
      seller_account_transaction_id: "seller-tx-1",
    }

    it("increases buy-off shares: debits buyer savings and credits seller savings by valueDifference", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [BUY_OFF_SHARE] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [BUY_OFF_MOVE] })
        }
        if (/SELECT account_id FROM transactions/i.test(queryText)) {
          return Promise.resolve({ rows: [{ account_id: BUYER_ACC_ID }] })
        }
        if (/SELECT available_balance FROM savings_accounts/i.test(queryText)) {
          return Promise.resolve({ rows: [{ available_balance: 500000 }] })
        }
        return Promise.resolve({ rows: [] })
      })

      // Increase buy-off from 5 to 8 shares (+3 shares, +150,000 valueDifference)
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 8,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.actionType).toBe("buy_off")
      expect(body.settlement).toEqual({
        previousTotalValue: 250000,
        newTotalValue: 400000,
        valueDifference: 150000,
        sharesDifference: 3,
        settled: true,
      })

      // Check savings debited for buyer
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE savings_accounts\s+SET available_balance = available_balance - \$1/),
        [150000, expect.anything()],
      )

      // Check twin records updated
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE member_shares\s+SET number_of_shares = \$1,[\s\S]+WHERE id = \$5/),
        [8, 50000, 400000, 3, "seller-share-id"],
      )
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE member_shares\s+SET number_of_shares = \$1,[\s\S]+WHERE id = \$5/),
        [8, 50000, 400000, 3, SHARE_ID],
      )
    })

    it("decreases buy-off shares: refunds buyer savings and debits seller savings by |valueDifference|", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const shareToReduce = { ...BUY_OFF_SHARE, number_of_shares: 8, total_value: 400000, remaining_shares: 8 }
      const moveToReduce = { ...BUY_OFF_MOVE, from_shares: 8, to_shares: 8, to_remaining: 8 }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [shareToReduce] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [moveToReduce] })
        }
        if (/SELECT account_id FROM transactions/i.test(queryText)) {
          return Promise.resolve({ rows: [{ account_id: SELLER_ACC_ID }] })
        }
        if (/SELECT available_balance FROM savings_accounts/i.test(queryText)) {
          return Promise.resolve({ rows: [{ available_balance: 500000 }] })
        }
        return Promise.resolve({ rows: [] })
      })

      // Decrease from 8 to 5 shares (-3 shares, -150,000 valueDifference)
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 5,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.actionType).toBe("buy_off")
      expect(body.settlement).toEqual({
        previousTotalValue: 400000,
        newTotalValue: 250000,
        valueDifference: -150000,
        sharesDifference: -3,
        settled: true,
      })

      // Check buyer refunded (+150,000)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE savings_accounts\s+SET available_balance = available_balance \+ \$1/),
        [150000, expect.anything()],
      )

      // Check seller debited for clawback (-150,000)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE savings_accounts\s+SET available_balance = available_balance - \$1/),
        [150000, expect.anything()],
      )
    })

    it("rejects buy-off increase when buyer has insufficient savings balance", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [BUY_OFF_SHARE] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [BUY_OFF_MOVE] })
        }
        if (/SELECT account_id FROM transactions/i.test(queryText)) {
          return Promise.resolve({ rows: [{ account_id: BUYER_ACC_ID }] })
        }
        if (/SELECT available_balance FROM savings_accounts/i.test(queryText)) {
          return Promise.resolve({ rows: [{ available_balance: 50000 }] }) // Only 50k, need 150k!
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 8,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("insufficient_account_balance")
    })

    it("rejects buy-off decrease when seller has insufficient savings balance for refund clawback", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const shareToReduce = { ...BUY_OFF_SHARE, number_of_shares: 8, total_value: 400000, remaining_shares: 8 }
      const moveToReduce = { ...BUY_OFF_MOVE, from_shares: 8, to_shares: 8, to_remaining: 8 }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [shareToReduce] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [moveToReduce] })
        }
        if (/SELECT account_id FROM transactions/i.test(queryText)) {
          return Promise.resolve({ rows: [{ account_id: SELLER_ACC_ID }] })
        }
        if (/SELECT available_balance FROM savings_accounts/i.test(queryText)) {
          return Promise.resolve({ rows: [{ available_balance: 20000 }] }) // Only 20k, need 150k!
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 5,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("insufficient_account_balance")
    })

    it("settles non-savings buy-off via settlePaymentByMode inflow and outflow", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const bankMove = {
        ...BUY_OFF_MOVE,
        buyer_account_transaction_id: null,
        seller_account_transaction_id: null,
      }
      const bankShare = {
        ...BUY_OFF_SHARE,
        mode: "Bank Transfer",
        bank_account_id: BANK_ACCOUNT_ID,
      }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [bankShare] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [bankMove] })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 8,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.settlement.valueDifference).toBe(150000)

      // Check settlePaymentByMode called with flow: "inflow" and amount: 150,000 (positive number)
      expect(settlePaymentByModeMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          flow: "inflow",
          amount: 150000,
          mode: "Bank Transfer",
          bankAccountId: BANK_ACCOUNT_ID,
        }),
      )
    })

    it("rejects buy-off increase when seller has insufficient remaining shares", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const tightMove = {
        ...BUY_OFF_MOVE,
        from_remaining: 1, // Only 1 remaining, but trying to increase by 3!
      }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [BUY_OFF_SHARE] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [tightMove] })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 8,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("insufficient_shares")
    })

    it("rejects buy-off decrease when buyer has already transferred or sold shares", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const tightMove = {
        ...BUY_OFF_MOVE,
        from_shares: 8,
        to_shares: 8,
        to_remaining: 1, // Buyer only has 1 remaining share left!
      }
      const buyerShare = {
        ...BUY_OFF_SHARE,
        number_of_shares: 8,
        remaining_shares: 8,
        total_value: 400000,
      }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [buyerShare] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [tightMove] })
        }
        return Promise.resolve({ rows: [] })
      })

      // Reducing from 8 to 5 (-3 shares), but buyer only has 1 remaining in move.to_remaining
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "buy_off",
          numberOfShares: 5,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("shares_already_transferred_or_sold")
    })
  })

  // =========================================================================
  // 7. SETTLEMENT DIFFERENCE IN TRANSFER EDITS
  // =========================================================================
  describe("Settlement Difference in Transfer Edits", () => {
    const TRANSFER_SHARE = {
      id: SHARE_ID,
      member_id: MEMBER_ID,
      status: "active",
      acquisition_type: "transfer_in",
      number_of_shares: 5,
      remaining_shares: 5,
      total_value: 250000,
      share_value: 50000,
      date: "2026-02-01",
    }
    const TRANSFER_MOVE = {
      id: "move-2",
      move_type: "transfer",
      from_id: "sender-share-id",
      from_shares: 5,
      from_remaining: 10,
      to_id: SHARE_ID,
      to_shares: 5,
      to_remaining: 5,
    }

    it("successfully edits transfer: updates twin records and returns settlement", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [TRANSFER_SHARE] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [TRANSFER_MOVE] })
        }
        return Promise.resolve({ rows: [] })
      })

      // Increase transfer from 5 to 7 shares (+2 shares)
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "transfer",
          numberOfShares: 7,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.actionType).toBe("transfer")
      expect(body.settlement).toEqual({
        previousTotalValue: 250000,
        newTotalValue: 350000,
        valueDifference: 100000,
        sharesDifference: 2,
        settled: true,
      })

      // Check sender updated (-2 remaining shares)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE member_shares\s+SET number_of_shares = \$1,[\s\S]+WHERE id = \$5/),
        [7, 50000, 350000, 2, "sender-share-id"],
      )

      // Check recipient updated (+2 remaining shares)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE member_shares\s+SET number_of_shares = \$1,[\s\S]+WHERE id = \$5/),
        [7, 50000, 350000, 2, SHARE_ID],
      )
    })

    it("rejects transfer increase when sender has insufficient remaining shares", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const tightTransfer = {
        ...TRANSFER_MOVE,
        from_remaining: 1, // Only 1 remaining, but trying to increase by 2!
      }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [TRANSFER_SHARE] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [tightTransfer] })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "transfer",
          numberOfShares: 7,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("insufficient_shares")
    })

    it("rejects transfer decrease when recipient has already transferred or sold shares", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      const tightTransfer = {
        ...TRANSFER_MOVE,
        to_remaining: 1, // Recipient only has 1 remaining share left!
      }

      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [TRANSFER_SHARE] })
        }
        if (/SELECT shares, share_value/i.test(queryText)) {
          return Promise.resolve({ rows: [{ shares: "true", share_value: "50000" }] })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [tightTransfer] })
        }
        return Promise.resolve({ rows: [] })
      })

      // Reducing from 5 to 2 (-3 shares), but recipient only has 1 remaining in move.to_remaining
      const req = new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({
          actionType: "transfer",
          numberOfShares: 2,
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("shares_already_transferred_or_sold")
    })
  })

  // =========================================================================
  // 8. SUCCESSFUL VOID (DELETE)
  // =========================================================================
  describe("Successful Void via DELETE", () => {
    it("successfully marks share record cancelled and settles outflow via settlePaymentByMode", async () => {
      getServerSessionMock.mockResolvedValue(makeStaffSession())
      mockClient.query.mockImplementation((queryText: string) => {
        if (/SELECT ms\.\*/i.test(queryText)) {
          return Promise.resolve({
            rows: [
              {
                id: SHARE_ID,
                member_id: MEMBER_ID,
                status: "active",
                acquisition_type: "purchase",
                number_of_shares: 8,
                remaining_shares: 8,
                total_value: 400000,
                transaction_id: OLD_TX_ID,
                mode: "Cash",
                date: "2026-01-20",
              },
            ],
          })
        }
        if (/SELECT sm\.\*/i.test(queryText)) {
          return Promise.resolve({ rows: [] })
        }
        if (/SELECT invoice_type/i.test(queryText)) {
          return Promise.resolve({
            rows: [{ invoice_type: "Auto", item_desc: "Share Purchase" }],
          })
        }
        return Promise.resolve({ rows: [] })
      })

      const req = new Request("http://localhost/api", {
        method: "DELETE",
        body: JSON.stringify({ reason: "Accidental duplicate entry" }),
      })
      const res = await DELETE(req, { params: Promise.resolve({ id: MEMBER_ID, shareId: SHARE_ID }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.message).toBe("Share record voided successfully")

      // Verify old invoice payment was cancelled
      expect(cancelInvoicePaymentByTransactionIdMock).toHaveBeenCalledWith(
        mockClient,
        OLD_TX_ID,
        expect.anything(),
      )

      // Verify settlePaymentByMode called with outflow of 400,000 (positive number)
      expect(settlePaymentByModeMock).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          flow: "outflow",
          amount: 400000,
          mode: "Cash",
        }),
      )

      // Verify audit logging
      expect(auditLoggerMock.logUpdate).toHaveBeenCalledWith(
        "member_shares",
        SHARE_ID,
        expect.objectContaining({ status: "active", remaining_shares: 8 }),
        expect.objectContaining({ status: "cancelled", remaining_shares: 0, void_reason: "Accidental duplicate entry" }),
        INSTITUTION_ID,
        STAFF_ID,
        expect.objectContaining({ branch_id: BRANCH_ID }),
        mockClient,
      )
    })
  })
})
