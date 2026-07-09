import { GET, POST } from "@/app/api/institution/third-party-agents/route"
import { mockNextRequest } from "@/__tests__/utils/api-test-helpers"

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
    resolveActorContext: jest.fn(),
    hasPermission: jest.fn(),
    assertNotSuperAdmin: jest.fn(),
    isSuperAdmin: jest.fn(),
  }
})

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

jest.mock("@/lib/staff/staff-status", () => ({
  assertActorActive: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/third-party-agent-events", () => ({
  notifyThirdPartyAgentCreated: jest.fn().mockResolvedValue({
    ok: true,
    staffNotifications: 1,
    errors: [],
  }),
}))

import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { notifyThirdPartyAgentCreated } from "@/lib/notifications/third-party-agent-events"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const isSuperAdminMock = isSuperAdmin as jest.Mock
const assertBranchActiveMock = assertBranchActive as jest.Mock
const assertActorActiveMock = assertActorActive as jest.Mock
const notifyThirdPartyAgentCreatedMock = notifyThirdPartyAgentCreated as jest.Mock

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
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
  role: "Manager",
  status: "Active",
}

function setupAuth() {
  getServerSessionMock.mockResolvedValue(staffSession)
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  isSuperAdminMock.mockReturnValue(false)
  assertBranchActiveMock.mockResolvedValue({ ok: true })
  assertActorActiveMock.mockResolvedValue({ ok: true, staff: { id: STAFF_ID } })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => {
    if (permission === "view_third_party_agents") return true
    if (permission === "create_third_party_agent") return true
    return false
  })
  runWithoutAuthMock.mockImplementation(async (fn) => fn({ query: jest.fn() }))
}

describe("GET /api/institution/third-party-agents", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("returns 401 when unauthenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const req = mockNextRequest("http://localhost/api/institution/third-party-agents")
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns paginated list with summary counts", async () => {
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({
        rows: [{ total: 25, active: 20, inactive_suspended: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "agent-1", name: "Acme Finance", status: "Active" }],
      })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(
      "http://localhost/api/institution/third-party-agents?page=1&rowsPerPage=10",
    )
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.third_party_agents).toHaveLength(1)
    expect(body.pagination).toEqual({ page: 1, rowsPerPage: 10, total: 25 })
    expect(body.summary).toEqual({ total: 25, active: 20, inactive_suspended: 5 })

    const listCall = queryMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("LIMIT"),
    )
    expect(listCall).toBeDefined()
    expect(listCall![0]).toContain("OFFSET")
  })
})

describe("POST /api/institution/third-party-agents", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("returns 400 when name is missing", async () => {
    const req = mockNextRequest("http://localhost/api/institution/third-party-agents", {
      method: "POST",
      body: { status: "Active" },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Name is required")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 403 when super admin attempts to create", async () => {
    assertNotSuperAdminMock.mockReturnValue({
      ok: false,
      error: SUPER_ADMIN_WRITE_BLOCKED,
      message: "Super admins are not allowed to edit or modify data.",
    })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: jest.fn() }))

    const req = mockNextRequest("http://localhost/api/institution/third-party-agents", {
      method: "POST",
      body: { name: "Acme Finance", status: "Active" },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe(SUPER_ADMIN_WRITE_BLOCKED)
  })

  it("creates an agent and dispatches notifications", async () => {
    const inserted = {
      id: "agent-1",
      institution_id: INSTITUTION_ID,
      branch_id: BRANCH_ID,
      name: "Acme Finance",
      status: "Active",
      email: null,
      address: null,
      phone: null,
      created_by: STAFF_ID,
      created_at: "2026-01-01T00:00:00.000Z",
      modified_by: STAFF_ID,
      updated_at: "2026-01-01T00:00:00.000Z",
    }

    const queryMock = jest.fn().mockResolvedValueOnce({ rows: [inserted] })
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest("http://localhost/api/institution/third-party-agents", {
      method: "POST",
      body: { name: "Acme Finance", status: "Active" },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.third_party_agent.name).toBe("Acme Finance")
    expect(runWithoutAuthMock).toHaveBeenCalled()
    expect(notifyThirdPartyAgentCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: { id: "agent-1", name: "Acme Finance" },
      }),
    )
  })
})
