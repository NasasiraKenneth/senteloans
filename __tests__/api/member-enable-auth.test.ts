import { POST } from "@/app/api/institution/members/[id]/auth/route"
import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn(),
}))

jest.mock("@/lib/api/rbac", () => ({
  hasPermission: jest.fn().mockResolvedValue(true),
  assertNotSuperAdmin: jest.fn().mockReturnValue({ ok: true }),
  resolveActorContext: jest.fn().mockResolvedValue({
    id: "actor-user-id",
    institution_id: "inst-uuid-1",
    branch_id: "branch-uuid-1",
    role: "manager",
  }),
  SUPER_ADMIN_WRITE_BLOCKED: "super_admin_write_blocked",
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/chats/server/identity", () => ({
  ensureMemberChatIdentity: jest.fn().mockResolvedValue({ id: "chat-identity-1" }),
  ensureSystemChatIdentity: jest.fn().mockResolvedValue("system-identity-1"),
}))

jest.mock("@/lib/chats/server/ensure-member-support", () => ({
  ensureMemberSupportConversation: jest.fn().mockResolvedValue({ created: true }),
}))

jest.mock("@/lib/chats/server/assert-chats-enabled", () => ({
  isChatsModuleEnabled: jest.fn().mockResolvedValue(false),
}))

jest.mock("@/lib/notifications/member-events", () => ({
  notifyMemberPortalLoginEnabled: jest.fn().mockResolvedValue({
    ok: true,
    memberNotifications: [],
    staffNotifications: [],
    errors: [],
  }),
}))

jest.mock("@/lib/email/member-emails", () => ({
  enqueueMemberPortalCredentialsEmail: jest.fn().mockResolvedValue({
    enqueued: [],
    skipped: [],
    errors: [],
  }),
}))

describe("POST /api/institution/members/[id]/auth", () => {
  const mockStaffSession = {
    user: {
      authUserId: "staff-auth-123",
      type: "staff",
    },
  }

  const memberId = "member-uuid-1"
  const institutionId = "inst-uuid-1"
  const branchId = "branch-uuid-1"

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(mockStaffSession)
  })

  function buildMockClient(opts: {
    existingAuth?: { id: string; user_type: string } | null
    staffUser?: { id: string; status: string; auth_id: string | null } | null
    existingMemberAuthId?: string | null
  }) {
    const executedQueries: Array<{ sql: string; values: any[] }> = []

    const mockClient = {
      query: jest.fn().mockImplementation((queryText: string, values: any[] = []) => {
        executedQueries.push({ sql: queryText, values })
        const sql = queryText.toLowerCase()

        // Member lookup
        if (sql.includes("from members") && sql.includes("where id = $1")) {
          return Promise.resolve({
            rows: [
              {
                id: memberId,
                institution_id: institutionId,
                branch_id: branchId,
                email: "test@example.com",
                full_name: "Test Member",
                member_number: "M001",
                status: "Active",
              },
            ],
          })
        }
        // Branch lookup
        if (sql.includes("from branches") && sql.includes("where id = $1")) {
          return Promise.resolve({
            rows: [
              {
                id: branchId,
                institution_id: institutionId,
                status: "Active",
              },
            ],
          })
        }
        // Institution name
        if (sql.includes("select name from institutions")) {
          return Promise.resolve({ rows: [{ name: "Test SACCO" }] })
        }
        // Member existing auth_id check
        if (sql.includes("select auth_id from members where id = $1")) {
          return Promise.resolve({
            rows: [{ auth_id: opts.existingMemberAuthId || null }],
          })
        }
        // Existing email check in app_auth_users
        if (sql.includes("from app_auth_users where lower(email) = $1")) {
          return Promise.resolve({
            rows: opts.existingAuth ? [opts.existingAuth] : [],
          })
        }
        // Linked to another member check
        if (sql.includes("select id from members where auth_id = $1 and id <> $2")) {
          return Promise.resolve({ rows: [] })
        }
        // Staff user check in users table
        if (sql.includes("from users where") && (sql.includes("auth_id = $1") || sql.includes("lower(email) = $2") || sql.includes("lower(email) = $1"))) {
          return Promise.resolve({
            rows: opts.staffUser ? [opts.staffUser] : [],
          })
        }
        // Unique username candidate check
        if (sql.includes("select 1 from app_auth_users where username = $1")) {
          return Promise.resolve({ rowCount: 0, rows: [] })
        }

        // Generic update / insert
        return Promise.resolve({ rowCount: 1, rows: [] })
      }),
    }

    return { mockClient, executedQueries }
  }

  it("updates user_type to hybrid when matching email exists in auth table and staff user is Active", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingAuth: { id: "auth-existing-uuid", user_type: "member" },
      staffUser: { id: "staff-1", status: "Active", auth_id: "auth-existing-uuid" },
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/members/member-uuid-1/auth", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com" }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: memberId }) })
    expect(res.status).toBe(200)

    const updateAuthQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE app_auth_users SET user_type = $1")
    )
    expect(updateAuthQuery).toBeDefined()
    expect(updateAuthQuery?.values[0]).toBe("hybrid")
    expect(updateAuthQuery?.values[2]).toBe("auth-existing-uuid")

    const updateMemberQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE members SET auth_id = $1 WHERE id = $2")
    )
    expect(updateMemberQuery).toBeDefined()
    expect(updateMemberQuery?.values).toEqual(["auth-existing-uuid", memberId])
  })

  it("updates user_type to member when matching email exists in auth table but staff user is Inactive", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingAuth: { id: "auth-existing-uuid", user_type: "institution_staff" },
      staffUser: { id: "staff-1", status: "Inactive", auth_id: "auth-existing-uuid" },
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/members/member-uuid-1/auth", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com" }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: memberId }) })
    expect(res.status).toBe(200)

    const updateAuthQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE app_auth_users SET user_type = $1")
    )
    expect(updateAuthQuery).toBeDefined()
    expect(updateAuthQuery?.values[0]).toBe("member")
    expect(updateAuthQuery?.values[2]).toBe("auth-existing-uuid")

    const updateMemberQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE members SET auth_id = $1 WHERE id = $2")
    )
    expect(updateMemberQuery).toBeDefined()
    expect(updateMemberQuery?.values).toEqual(["auth-existing-uuid", memberId])
  })

  it("creates a new app_auth_users record when no matching email is found and links member", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingAuth: null,
      staffUser: null,
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/members/member-uuid-1/auth", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com" }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: memberId }) })
    expect(res.status).toBe(200)

    const insertAuthQuery = executedQueries.find((q) =>
      q.sql.includes("INSERT INTO app_auth_users")
    )
    expect(insertAuthQuery).toBeDefined()
    expect(insertAuthQuery?.values[1]).toBe("member")

    const updateMemberQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE members SET auth_id = $1 WHERE id = $2")
    )
    expect(updateMemberQuery).toBeDefined()
    expect(updateMemberQuery?.values[1]).toBe(memberId)
  })
})
