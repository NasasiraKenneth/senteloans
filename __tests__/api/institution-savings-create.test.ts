import { POST } from "@/app/api/institution/savings/route"
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
    assertNotSuperAdmin: jest.fn(),
  }
})

jest.mock("@/lib/staff/staff-status", () => ({
  assertActorActive: jest.fn(),
}))

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

jest.mock("@/lib/members/member-status", () => ({
  assertMemberActive: jest.fn(),
}))

jest.mock("@/lib/ids/insert-with-prefixed-number-retry", () => ({
  insertWithPrefixedNumberRetry: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import { assertNotSuperAdmin } from "@/lib/api/rbac"
import { assertActorActive } from "@/lib/staff/staff-status"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertMemberActive } from "@/lib/members/member-status"
import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"
import { auditLogger } from "@/lib/audit/audit-logger"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const assertActorActiveMock = assertActorActive as jest.Mock
const assertBranchActiveMock = assertBranchActive as jest.Mock
const assertMemberActiveMock = assertMemberActive as jest.Mock
const insertWithPrefixedNumberRetryMock = insertWithPrefixedNumberRetry as jest.Mock
const auditLoggerMock = auditLogger as jest.Mocked<typeof auditLogger>

const MEMBER_ID = "55555555-5555-5555-5555-555555555555"
const ACCOUNT_ID = "66666666-6666-6666-6666-666666666666"
const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
const OTHER_BRANCH_ID = "33333333-3333-3333-3333-333333333333"
const STAFF_ID = "staff-1"
const AUTH_USER_ID = "auth-user-1"

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

const activeMember = {
  id: MEMBER_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  full_name: "Jane Doe",
  member_number: "M-001",
  email: null,
  status: "Active" as const,
}

const createdAccount = {
  id: ACCOUNT_ID,
  account_number: "SA111111-2606-ABCD",
  account_type: "Voluntary",
  member_id: MEMBER_ID,
  status: "Active",
  open_date: "2026-06-17",
  available_balance: 0,
  total_balance: 0,
}

const validBody = {
  member_id: MEMBER_ID,
  account_type: "Voluntary",
}

function postRequest(body: Record<string, unknown> = validBody) {
  return new Request("http://localhost/api/institution/savings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function createMockClient(options?: { hasAddAccountPermission?: boolean; actorMissingInstitution?: boolean }) {
  const hasAddAccountPermission = options?.hasAddAccountPermission !== false
  const actorMissingInstitution = options?.actorMissingInstitution === true

  return {
    query: jest.fn().mockImplementation(async (sql: string) => {
      const s = normalizeSql(sql)

      if (s.includes("from users u") && s.includes("auth_id")) {
        return {
          rows: actorMissingInstitution ? [{ ...actor, institution_id: null }] : [actor],
        }
      }

      if (s.includes("from role_permissions")) {
        return { rows: hasAddAccountPermission ? [{}] : [], rowCount: hasAddAccountPermission ? 1 : 0 }
      }

      if (s.includes("insert into savings_accounts")) {
        return { rows: [createdAccount] }
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

function setupHappyPath(options?: { hasAddAccountPermission?: boolean }) {
  const client = createMockClient(options)
  setupRunWithAuth(client)

  getServerSessionMock.mockResolvedValue(staffSession)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  assertActorActiveMock.mockResolvedValue({ ok: true })
  assertBranchActiveMock.mockResolvedValue({
    ok: true,
    branch: { id: BRANCH_ID, institution_id: INSTITUTION_ID, name: "HQ", status: "Active" },
  })
  assertMemberActiveMock.mockResolvedValue({ ok: true, member: activeMember })
  insertWithPrefixedNumberRetryMock.mockResolvedValue({
    row: createdAccount,
    number: createdAccount.account_number,
  })

  return client
}

describe("POST /api/institution/savings", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  describe("validation", () => {
    it("returns 400 when member_id is missing", async () => {
      const res = await POST(postRequest({ account_type: "Voluntary" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("member_id_required")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 400 when account_type is missing", async () => {
      const res = await POST(postRequest({ member_id: MEMBER_ID }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("invalid_account_type")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 400 for an unsupported account_type", async () => {
      const res = await POST(postRequest({ member_id: MEMBER_ID, account_type: "Premium" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("invalid_account_type")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 400 when Fixed account has no monthly savings", async () => {
      const res = await POST(postRequest({ member_id: MEMBER_ID, account_type: "Fixed" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("monthly_savings_required_for_fixed_account")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })
  })

  describe("auth", () => {
    it("returns 401 when there is no session", async () => {
      getServerSessionMock.mockResolvedValue(null)

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.error).toBe("unauthorized")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 403 when the session is not staff", async () => {
      getServerSessionMock.mockResolvedValue({
        user: { authUserId: AUTH_USER_ID, type: "client" },
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("no_app_user_profile")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 403 when super admin attempts to create an account", async () => {
      setupHappyPath()
      assertNotSuperAdminMock.mockReturnValue({
        ok: false,
        status: 403,
        error: SUPER_ADMIN_WRITE_BLOCKED,
        message: SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe(SUPER_ADMIN_WRITE_BLOCKED)
    })

    it("returns 403 when staff lacks add_account permission", async () => {
      setupHappyPath({ hasAddAccountPermission: false })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("missing_permission:add_account")
    })

    it("returns 403 when actor has no linked institution profile", async () => {
      const client = createMockClient({ actorMissingInstitution: true })
      setupRunWithAuth(client)
      assertNotSuperAdminMock.mockReturnValue({ ok: true })
      assertActorActiveMock.mockResolvedValue({ ok: true })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("no_app_user_profile")
    })
  })

  describe("business rules", () => {
    beforeEach(() => {
      setupHappyPath()
    })

    it("returns 403 when actor branch is missing because permission check fails first", async () => {
      const client = createMockClient()
      setupRunWithAuth(client)
      assertNotSuperAdminMock.mockReturnValue({ ok: true })
      assertActorActiveMock.mockResolvedValue({ ok: true })
      client.query.mockImplementation(async (sql: string) => {
        const s = normalizeSql(sql)
        if (s.includes("from users u") && s.includes("auth_id")) {
          return { rows: [{ ...actor, branch_id: null }] }
        }
        if (s.includes("from role_permissions")) {
          return { rows: [{}], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("missing_permission:add_account")
    })

    it("returns 403 when staff is inactive", async () => {
      assertActorActiveMock.mockResolvedValue({
        ok: false,
        error: "staff_inactive",
        status: "Inactive",
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("staff_inactive")
    })

    it("returns 403 when branch is inactive", async () => {
      assertBranchActiveMock.mockResolvedValue({
        ok: false,
        error: "branch_inactive",
        status: "Inactive",
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("branch_inactive")
    })

    it("returns 404 when member is not found", async () => {
      assertMemberActiveMock.mockResolvedValue({ ok: false, error: "member_not_found" })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe("member_not_found")
    })

    it("returns 403 when member is inactive", async () => {
      assertMemberActiveMock.mockResolvedValue({
        ok: false,
        error: "member_inactive",
        status: "Suspended",
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("member_inactive")
    })

    it("returns 403 when member belongs to a different branch", async () => {
      assertMemberActiveMock.mockResolvedValue({
        ok: true,
        member: { ...activeMember, branch_id: OTHER_BRANCH_ID },
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("cross_branch_operation_forbidden")
    })

    it("returns 409 when account number generation fails after retries", async () => {
      insertWithPrefixedNumberRetryMock.mockResolvedValue(null)

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toBe("duplicate_savings_account_number")
    })
  })

  describe("successful create", () => {
    it("returns 201 and creates a savings account with audit log", async () => {
      const client = setupHappyPath()

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.account).toEqual(createdAccount)

      expect(insertWithPrefixedNumberRetryMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          prefix: "SA",
          savepointName: "sp_ins_savings_num_retry",
          client,
        }),
      )

      expect(auditLoggerMock.logInsert).toHaveBeenCalledWith(
        "savings_accounts",
        ACCOUNT_ID,
        expect.objectContaining({
          member_id: MEMBER_ID,
          account_number: createdAccount.account_number,
          account_type: "Voluntary",
        }),
        INSTITUTION_ID,
        STAFF_ID,
        { branch_id: BRANCH_ID },
        client,
      )
    })

    it("accepts all supported account types", async () => {
      setupHappyPath()

      for (const accountType of ["Voluntary", "Shares", "Current"]) {
        insertWithPrefixedNumberRetryMock.mockResolvedValueOnce({
          row: { ...createdAccount, account_type: accountType },
          number: createdAccount.account_number,
        })

        const res = await POST(postRequest({ member_id: MEMBER_ID, account_type: accountType }))
        const body = await res.json()

        expect(res.status).toBe(201)
        expect(body.account.account_type).toBe(accountType)
      }

      insertWithPrefixedNumberRetryMock.mockResolvedValueOnce({
        row: { ...createdAccount, account_type: "Fixed" },
        number: createdAccount.account_number,
      })

      const fixedRes = await POST(
        postRequest({ member_id: MEMBER_ID, account_type: "Fixed", monthly_savings: 50_000 }),
      )
      const fixedBody = await fixedRes.json()

      expect(fixedRes.status).toBe(201)
      expect(fixedBody.account.account_type).toBe("Fixed")
    })

    it("stores monthly savings when creating a Fixed account", async () => {
      const client = setupHappyPath()
      const capturedParams: unknown[][] = []

      insertWithPrefixedNumberRetryMock.mockImplementation(async (queryFn: (n: string) => Promise<unknown>) => {
        const originalQuery = client.query
        client.query = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
          if (normalizeSql(sql).includes("insert into savings_accounts") && params) {
            capturedParams.push(params)
          }
          return originalQuery(sql, params)
        }) as typeof client.query
        await queryFn("SA-TEST-0001")
        return { row: { ...createdAccount, account_type: "Fixed" }, number: "SA-TEST-0001" }
      })

      const res = await POST(
        postRequest({ member_id: MEMBER_ID, account_type: "Fixed", monthly_savings: 75_000 }),
      )

      expect(res.status).toBe(201)
      expect(capturedParams[0]?.[4]).toBe("Fixed")
      expect(capturedParams[0]?.[5]).toBe(75_000)

      expect(auditLoggerMock.logInsert).toHaveBeenCalledWith(
        "savings_accounts",
        ACCOUNT_ID,
        expect.objectContaining({
          account_type: "Fixed",
          monthly_savings: 75_000,
        }),
        INSTITUTION_ID,
        STAFF_ID,
        { branch_id: BRANCH_ID },
        client,
      )
    })
  })
})
