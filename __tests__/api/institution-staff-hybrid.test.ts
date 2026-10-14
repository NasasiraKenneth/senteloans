import { POST } from "@/app/api/institution/staff/route"
import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
}))

jest.mock("@/lib/api/rbac", () => ({
  hasPermission: jest.fn().mockResolvedValue(true),
  assertNotSuperAdmin: jest.fn().mockReturnValue({ ok: true }),
  isSuperAdmin: jest.fn().mockReturnValue(false),
  resolveActorContext: jest.fn().mockResolvedValue({
    id: "actor-id",
    institution_id: "inst-id",
    branch_id: "branch-id",
    role: "institution_admin",
  }),
  SUPER_ADMIN_WRITE_BLOCKED: "super_admin_write_blocked",
  SUPER_ADMIN_WRITE_BLOCKED_MESSAGE: "Super admin cannot write",
}))

jest.mock("@/lib/api/staff-roles", () => ({
  canAssignRole: jest.fn().mockReturnValue(true),
  parseJoinedAt: jest.fn().mockReturnValue("2026-10-10"),
  parseStaffRoleId: jest.fn().mockReturnValue("role-uuid-1"),
  resolveRoleById: jest.fn().mockResolvedValue({
    id: "role-uuid-1",
    app_role: "loan_officer",
  }),
  VALID_STAFF_STATUSES: ["Active", "Inactive", "Suspended"],
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

describe("POST /api/institution/staff - Hybrid Account Integration", () => {
  const mockStaffSession = {
    user: {
      authUserId: "admin-auth-123",
      type: "staff",
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(mockStaffSession)
  })

  function buildMockClient(opts: {
    existingStaffUser?: { id: string } | null
    existingAuth?: { id: string; user_type: string; username: string } | null
    existingMember?: { id: string; status: string; auth_id?: string | null } | null
    usernameTakenByOther?: boolean
  }) {
    const executedQueries: Array<{ sql: string; values: any[] }> = []

    const mockClient = {
      query: jest.fn().mockImplementation((queryText: string, values: any[] = []) => {
        executedQueries.push({ sql: queryText, values })
        const sql = queryText.toLowerCase()

        // 1. users table email check
        if (sql.includes("from users where lower(email) = $1")) {
          return Promise.resolve({
            rows: opts.existingStaffUser ? [opts.existingStaffUser] : [],
          })
        }

        // 2. app_auth_users table email check
        if (sql.includes("from app_auth_users where lower(email) = $1")) {
          return Promise.resolve({
            rows: opts.existingAuth ? [opts.existingAuth] : [],
          })
        }

        // 3. username collision check
        if (sql.includes("from app_auth_users where lower(username) = $1") || sql.includes("from app_auth_users where username = $1")) {
          return Promise.resolve({
            rowCount: opts.usernameTakenByOther ? 1 : 0,
            rows: opts.usernameTakenByOther ? [{ id: "other-auth" }] : [],
          })
        }

        // 4. members table check
        if (sql.includes("from members where")) {
          return Promise.resolve({
            rows: opts.existingMember ? [opts.existingMember] : [],
          })
        }

        // Default query response
        return Promise.resolve({ rowCount: 1, rows: [] })
      }),
    }

    return { mockClient, executedQueries }
  }

  it("updates existing auth record to hybrid and reuses auth_id when email matches an active member", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingStaffUser: null,
      existingAuth: { id: "auth-member-1", user_type: "member", username: "john" },
      existingMember: { id: "member-1", status: "Active", auth_id: "auth-member-1" },
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/staff", {
      method: "POST",
      body: JSON.stringify({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        username: "john",
        password: "Password123!",
        roleId: "role-uuid-1",
        status: "Active",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    // Check that app_auth_users was updated to 'hybrid'
    const updateAuthQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE app_auth_users")
    )
    expect(updateAuthQuery).toBeDefined()
    expect(updateAuthQuery?.values[0]).toBe("hybrid")
    expect(updateAuthQuery?.values[3]).toBe("auth-member-1")

    // Check that new staff user in users table has auth_id = 'auth-member-1'
    const insertUserQuery = executedQueries.find((q) =>
      q.sql.includes("INSERT INTO users")
    )
    expect(insertUserQuery).toBeDefined()
    expect(insertUserQuery?.values[1]).toBe("auth-member-1")
  })

  it("sets user_type to institution_staff if existing member is Inactive", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingStaffUser: null,
      existingAuth: { id: "auth-member-1", user_type: "member", username: "john" },
      existingMember: { id: "member-1", status: "Inactive", auth_id: "auth-member-1" },
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/staff", {
      method: "POST",
      body: JSON.stringify({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        username: "john",
        password: "Password123!",
        roleId: "role-uuid-1",
        status: "Active",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    const updateAuthQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE app_auth_users")
    )
    expect(updateAuthQuery).toBeDefined()
    expect(updateAuthQuery?.values[0]).toBe("institution_staff")
    expect(updateAuthQuery?.values[3]).toBe("auth-member-1")
  })

  it("rejects creation if email already exists in users table (uniqueness check)", async () => {
    const { mockClient } = buildMockClient({
      existingStaffUser: { id: "already-a-staff" },
      existingAuth: null,
      existingMember: null,
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/staff", {
      method: "POST",
      body: JSON.stringify({
        firstName: "John",
        lastName: "Doe",
        email: "duplicate@example.com",
        username: "johndoe",
        password: "Password123!",
        roleId: "role-uuid-1",
        status: "Active",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.code).toBe("email_already_exists")
  })

  it("creates a brand new auth user when no matching email is in app_auth_users", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingStaffUser: null,
      existingAuth: null,
      existingMember: null,
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/staff", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        username: "janesmith",
        password: "Password123!",
        roleId: "role-uuid-1",
        status: "Active",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    const insertAuthQuery = executedQueries.find((q) =>
      q.sql.includes("INSERT INTO app_auth_users")
    )
    expect(insertAuthQuery).toBeDefined()
    expect(insertAuthQuery?.values[1]).toBe("institution_staff")
  })

  it("auto-generates unique username from email when username is omitted in request payload", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingStaffUser: null,
      existingAuth: null,
      existingMember: null,
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/staff", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Alice",
        lastName: "Cooper",
        email: "alice.cooper@example.com",
        password: "Password123!",
        roleId: "role-uuid-1",
        status: "Active",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    const insertAuthQuery = executedQueries.find((q) =>
      q.sql.includes("INSERT INTO app_auth_users")
    )
    expect(insertAuthQuery).toBeDefined()
    // Username generated from alice.cooper@example.com -> alicecooper or alice.cooper
    expect(insertAuthQuery?.values[2]).toBe("alice.cooper")
    expect(insertAuthQuery?.values[3]).toBe("alice.cooper@example.com")
  })

  it("reuses existing auth username when username is omitted and auth record already exists", async () => {
    const { mockClient, executedQueries } = buildMockClient({
      existingStaffUser: null,
      existingAuth: { id: "auth-123", user_type: "member", username: "existingalice" },
      existingMember: { id: "member-123", status: "Active", auth_id: "auth-123" },
    })
    ;(runWithAuth as jest.Mock).mockImplementation((_authId, cb) => cb(mockClient))

    const req = new Request("http://localhost/api/institution/staff", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Alice",
        lastName: "Cooper",
        email: "alice@example.com",
        password: "Password123!",
        roleId: "role-uuid-1",
        status: "Active",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    const updateAuthQuery = executedQueries.find((q) =>
      q.sql.includes("UPDATE app_auth_users")
    )
    expect(updateAuthQuery).toBeDefined()
    expect(updateAuthQuery?.values[1]).toBe("existingalice")
  })
})
