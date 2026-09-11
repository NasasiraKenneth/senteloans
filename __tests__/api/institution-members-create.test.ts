import { POST } from "@/app/api/institution/members/route"
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
  runWithoutAuth: jest.fn(),
}))

jest.mock("@/lib/api/rbac", () => {
  const actual = jest.requireActual("@/lib/api/rbac")
  return {
    ...actual,
    assertNotSuperAdmin: jest.fn(),
  }
})

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

jest.mock("@/lib/ids/insert-with-prefixed-number-retry", () => ({
  insertWithPrefixedNumberRetry: jest.fn(),
}))

jest.mock("@/lib/invoices/create-invoice", () => ({
  createInvoiceWithItems: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/email/seed-member-preferences", () => ({
  syncMemberEmailPreferences: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("@/lib/notifications/member-events", () => ({
  notifyMemberRegistration: jest.fn().mockResolvedValue({
    ok: true,
    memberNotifications: 2,
    staffNotifications: 1,
    errors: [],
  }),
}))

jest.mock("@/lib/email/member-emails", () => ({
  enqueueMemberRegistrationEmails: jest.fn().mockResolvedValue({
    enqueued: ["welcome", "kyc", "invoice"],
    skipped: [],
    errors: [],
  }),
}))

import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { assertNotSuperAdmin } from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"
import { createInvoiceWithItems } from "@/lib/invoices/create-invoice"
import { syncMemberEmailPreferences } from "@/lib/email/seed-member-preferences"
import { notifyMemberRegistration } from "@/lib/notifications/member-events"
import { enqueueMemberRegistrationEmails } from "@/lib/email/member-emails"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const assertBranchActiveMock = assertBranchActive as jest.Mock
const insertWithPrefixedNumberRetryMock = insertWithPrefixedNumberRetry as jest.Mock
const createInvoiceWithItemsMock = createInvoiceWithItems as jest.Mock
const syncMemberEmailPreferencesMock = syncMemberEmailPreferences as jest.Mock
const notifyMemberRegistrationMock = notifyMemberRegistration as jest.Mock
const enqueueMemberRegistrationEmailsMock = enqueueMemberRegistrationEmails as jest.Mock

const MEMBER_ID = "member-new-1"
const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
const STAFF_ID = "staff-1"
const AUTH_USER_ID = "auth-user-1"
const INVOICE_ID = "invoice-1"

const staffSession = {
  user: { authUserId: AUTH_USER_ID, type: "staff" },
}

const actor = {
  id: STAFF_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  role_id: "role-1",
  role: "manager",
}

const validBody = {
  fullName: "Jane Doe",
  phoneNumber: "0700123456",
  nationalId: "CM123456789",
  dateOfBirth: "1990-01-15",
  gender: "Female",
  memberType: "Individual",
  email: "jane@example.com",
}

function postRequest(body: Record<string, unknown> = validBody) {
  return new Request("http://localhost/api/institution/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function createMockClient(options?: {
  hasCreatePermission?: boolean
  membershipFee?: number
  minimumShares?: number
  shareValue?: number
}) {
  const hasCreatePermission = options?.hasCreatePermission !== false
  const membershipFee = options?.membershipFee ?? 50_000
  const minimumShares = options?.minimumShares ?? 0
  const shareValue = options?.shareValue ?? 0

  return {
    query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      const s = normalizeSql(sql)

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 }
      }

      if (s.includes("from users u") && s.includes("auth_id")) {
        return { rows: [actor] }
      }

      if (s.includes("from role_permissions")) {
        return { rows: hasCreatePermission ? [{}] : [], rowCount: hasCreatePermission ? 1 : 0 }
      }

      if (s.includes("from institutions where")) {
        return { rows: [{ id: INSTITUTION_ID, name: "Kampala SACCO", type: "SACCO" }] }
      }

      if (s.includes("from config where branch_id")) {
        return {
          rows: [
            {
              currency: "UGX",
              membership_fee: membershipFee,
              share_value: shareValue,
              minimum_shares: minimumShares,
              invoice_overdue_period: 30,
            },
          ],
        }
      }

      if (s.includes("from account_type") || s.includes("insert into account_type")) {
        const typeArg = String(params?.[1] || params?.[2] || "")
        const matchName = /fixed/i.test(typeArg) ? "Fixed" : "Voluntary"
        return { rows: [{ id: `at-${matchName.toLowerCase()}-id`, account_name: matchName }] }
      }

      if (s.includes("insert into members")) {
        return { rows: [{ id: MEMBER_ID, member_number: "M-TEST-0001" }] }
      }

      if (s.includes("insert into savings_accounts")) {
        return { rows: [{ id: "sav-1", account_number: "SA-TEST-0001" }] }
      }

      return { rows: [], rowCount: 0 }
    }),
  }
}

function setupRunWithAuth(client: ReturnType<typeof createMockClient>) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof client) => unknown) =>
    fn(client),
  )
}

function setupHappyPath(options?: {
  membershipFee?: number
  minimumShares?: number
  shareValue?: number
}) {
  const client = createMockClient({
    membershipFee: options?.membershipFee,
    minimumShares: options?.minimumShares,
    shareValue: options?.shareValue,
  })
  setupRunWithAuth(client)

  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  assertBranchActiveMock.mockResolvedValue({
    ok: true,
    branch: { id: BRANCH_ID, institution_id: INSTITUTION_ID, name: "HQ", status: "Active" },
  })

  insertWithPrefixedNumberRetryMock
    .mockResolvedValueOnce({ row: { id: MEMBER_ID, member_number: "M-TEST-0001" } })
    .mockResolvedValueOnce({ row: { id: "sav-1", account_number: "SA-TEST-0001" } })

  createInvoiceWithItemsMock.mockImplementation(async (_client: unknown, input: { items: { unit: string; total_price: number }[] }) => {
    const isShares = input.items[0]?.unit === "Shares"
    return {
      id: isShares ? "invoice-shares-1" : INVOICE_ID,
      invoice_number: isShares ? "INV-SHARES-001" : "INV-001",
      total_amount: input.items[0]?.total_price ?? 50_000,
      invoice_due: "2026-07-17",
    }
  })

  runWithoutAuthMock.mockImplementation(async (fn: (c: { query: jest.Mock }) => unknown) =>
    fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }),
  )

  return client
}

describe("POST /api/institution/members", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  describe("validation", () => {
    it("returns 400 when a required field is missing", async () => {
      const res = await POST(postRequest({ ...validBody, fullName: "" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("missing_field: fullName")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 400 for invalid Uganda phone format", async () => {
      const res = await POST(postRequest({ ...validBody, phoneNumber: "1234567890" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("invalid_phone_ug_format")
    })

    it("returns 400 for invalid email", async () => {
      const res = await POST(postRequest({ ...validBody, email: "not-an-email" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("invalid_email")
    })

    it("returns 400 when Fixed account has no monthly savings", async () => {
      setupHappyPath()

      const res = await POST(
        postRequest({
          ...validBody,
          savingsAccountType: "Fixed",
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("monthly_savings_required_for_fixed_account")
      expect(insertWithPrefixedNumberRetryMock).not.toHaveBeenCalled()
    })

    it("stores monthly savings on the savings account for Fixed accounts", async () => {
      const client = setupHappyPath()
      const capturedSavingsParams: unknown[][] = []
      insertWithPrefixedNumberRetryMock.mockReset()
      insertWithPrefixedNumberRetryMock
        .mockImplementationOnce(async (queryFn: (n: string) => Promise<unknown>) => {
          await queryFn("M-TEST-0001")
          return { row: { id: MEMBER_ID, member_number: "M-TEST-0001" } }
        })
        .mockImplementationOnce(async (queryFn: (n: string) => Promise<unknown>) => {
          const originalQuery = client.query
          client.query = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
            if (normalizeSql(sql).includes("insert into savings_accounts") && params) {
              capturedSavingsParams.push(params)
            }
            return originalQuery(sql, params)
          }) as typeof client.query
          await queryFn("SA-TEST-0001")
          return { row: { id: "sav-1", account_number: "SA-TEST-0001" } }
        })

      const res = await POST(
        postRequest({
          ...validBody,
          savingsAccountType: "Fixed",
          monthlySavings: 75_000,
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.savings_account).toEqual({
        account_number: "SA-TEST-0001",
        account_type: "Fixed",
      })
      expect(capturedSavingsParams[0]?.[5]).toBe(75_000)
      expect(capturedSavingsParams[0]?.[4]).toBe("at-fixed-id")
    })
  })

  describe("auth", () => {
    it("returns 401 when there is no session", async () => {
      getServerSessionMock.mockResolvedValue(null)

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.error).toBe("Unauthorized")
    })

    it("returns 403 when the session is not staff", async () => {
      getServerSessionMock.mockResolvedValue({
        user: { authUserId: AUTH_USER_ID, type: "client" },
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("no_app_user")
    })

    it("returns 403 when super admin attempts to create a member", async () => {
      setupHappyPath()
      assertNotSuperAdminMock.mockReturnValue({
        ok: false,
        error: SUPER_ADMIN_WRITE_BLOCKED,
        message: SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.code).toBe(SUPER_ADMIN_WRITE_BLOCKED)
    })

    it("returns 403 when staff lacks create_member permission", async () => {
      const client = createMockClient({ hasCreatePermission: false })
      setupRunWithAuth(client)
      assertNotSuperAdminMock.mockReturnValue({ ok: true })
      assertBranchActiveMock.mockResolvedValue({ ok: true, branch: { id: BRANCH_ID, status: "Active" } })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("missing_permission:create_member")
    })
  })

  describe("successful create", () => {
    it("returns 201 and runs post-commit notifications and emails", async () => {
      const client = setupHappyPath()

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.id).toBe(MEMBER_ID)
      expect(body.member_number).toBe("M-TEST-0001")
      expect(body.savings_account).toEqual({
        account_number: "SA-TEST-0001",
        account_type: "Voluntary",
      })
      expect(body.invoice).toEqual({
        id: INVOICE_ID,
        invoice_number: "INV-001",
        total_amount: 50_000,
        invoice_due: "2026-07-17",
      })

      expect(client.query).toHaveBeenCalledWith("BEGIN")
      expect(client.query).toHaveBeenCalledWith("COMMIT")
      expect(syncMemberEmailPreferencesMock).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          memberId: MEMBER_ID,
          emailEnabled: true,
        }),
      )
      expect(createInvoiceWithItemsMock).toHaveBeenCalled()
      expect(notifyMemberRegistrationMock).toHaveBeenCalled()
      expect(enqueueMemberRegistrationEmailsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          member: expect.objectContaining({ id: MEMBER_ID, email: "jane@example.com" }),
          savingsAccount: {
            account_number: "SA-TEST-0001",
            account_type: "Voluntary",
          },
          invoice: expect.objectContaining({ id: INVOICE_ID }),
          context: expect.objectContaining({
            institutionId: INSTITUTION_ID,
            branchId: BRANCH_ID,
          }),
        }),
      )
    })

    it("creates and emails both membership fee and shares invoice when minimum shares configured", async () => {
      setupHappyPath({ membershipFee: 50_000, minimumShares: 5, shareValue: 10_000 })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.invoice).toEqual({
        id: INVOICE_ID,
        invoice_number: "INV-001",
        total_amount: 50_000,
        invoice_due: "2026-07-17",
      })
      expect(body.shares_invoice).toEqual({
        id: "invoice-shares-1",
        invoice_number: "INV-SHARES-001",
        total_amount: 50_000,
        invoice_due: "2026-07-17",
      })

      expect(createInvoiceWithItemsMock).toHaveBeenCalledTimes(2)
      expect(enqueueMemberRegistrationEmailsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({ id: INVOICE_ID }),
          sharesInvoice: expect.objectContaining({ id: "invoice-shares-1" }),
        }),
      )
    })

    it("skips invoice when branch membership fee is zero and minimum shares is zero", async () => {
      setupHappyPath({ membershipFee: 0, minimumShares: 0 })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.invoice).toBeNull()
      expect(body.shares_invoice).toBeNull()
      expect(createInvoiceWithItemsMock).not.toHaveBeenCalled()
      expect(enqueueMemberRegistrationEmailsMock).toHaveBeenCalledWith(
        expect.objectContaining({ invoice: null, sharesInvoice: null }),
      )
    })

    it("syncs email prefs as disabled when member has no email", async () => {
      const client = setupHappyPath()
      const { email: _email, ...bodyWithoutEmail } = validBody

      const res = await POST(postRequest(bodyWithoutEmail))
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(syncMemberEmailPreferencesMock).toHaveBeenCalledWith(
        client,
        expect.objectContaining({ emailEnabled: false }),
      )
      expect(enqueueMemberRegistrationEmailsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          member: expect.objectContaining({ email: "" }),
        }),
      )
    })
  })

  describe("conflicts", () => {
    it("returns 409 for duplicate national ID", async () => {
      const client = createMockClient()
      setupRunWithAuth(client)
      assertNotSuperAdminMock.mockReturnValue({ ok: true })
      assertBranchActiveMock.mockResolvedValue({ ok: true, branch: { id: BRANCH_ID, status: "Active" } })

      insertWithPrefixedNumberRetryMock.mockReset()
      insertWithPrefixedNumberRetryMock.mockRejectedValue({
        code: "23505",
        constraint: "uk_members_national_id",
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toBe("duplicate_national_id")
      expect(client.query).toHaveBeenCalledWith("ROLLBACK")
    })
  })
})
