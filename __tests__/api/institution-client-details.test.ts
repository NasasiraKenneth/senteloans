import { GET, PATCH } from "@/app/api/institution/third-party-agents/[id]/route"
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

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/third-party-agent-events", () => ({
  notifyThirdPartyAgentUpdated: jest.fn().mockResolvedValue({
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
import { notifyThirdPartyAgentUpdated } from "@/lib/notifications/third-party-agent-events"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const isSuperAdminMock = isSuperAdmin as jest.Mock
const assertBranchActiveMock = assertBranchActive as jest.Mock
const notifyThirdPartyAgentUpdatedMock = notifyThirdPartyAgentUpdated as jest.Mock

const AGENT_ID = "agent-1"
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

const existingAgent = {
  id: AGENT_ID,
  branch_id: BRANCH_ID,
  name: "Acme Finance",
  status: "Active",
  email: "acme@example.com",
  address: "Kampala",
  phone: "+256700000000",
}

const updatedAgent = {
  ...existingAgent,
  institution_id: INSTITUTION_ID,
  status: "Inactive",
  modified_by: STAFF_ID,
  created_by: STAFF_ID,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
}

function setupAuth() {
  getServerSessionMock.mockResolvedValue(staffSession)
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  isSuperAdminMock.mockReturnValue(false)
  assertBranchActiveMock.mockResolvedValue({ ok: true })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => {
    if (permission === "view_third_party_agents") return true
    if (permission === "edit_third_party_agent") return true
    return false
  })
  runWithoutAuthMock.mockImplementation(async (fn) => fn({ query: jest.fn() }))
}

describe("GET /api/institution/third-party-agents/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("returns 401 when unauthenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`)
    const res = await GET(req, { params: Promise.resolve({ id: AGENT_ID }) })

    expect(res.status).toBe(401)
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the agent is not found", async () => {
    runWithAuthMock.mockImplementation(async (_authUserId, fn) =>
      fn({
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      }),
    )

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`)
    const res = await GET(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("third_party_agent_not_found")
  })

  it("returns the agent when found", async () => {
    runWithAuthMock.mockImplementation(async (_authUserId, fn) =>
      fn({
        query: jest.fn().mockResolvedValueOnce({
          rows: [{ ...existingAgent, branch_name: "Main Branch" }],
        }),
      }),
    )

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`)
    const res = await GET(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.third_party_agent.name).toBe("Acme Finance")
  })
})

describe("PATCH /api/institution/third-party-agents/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("returns 400 when no updatable fields are provided", async () => {
    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: {},
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("no_updatable_fields")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("applies a partial update when only status is provided", async () => {
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({ rows: [existingAgent] })
      .mockResolvedValueOnce({ rows: [updatedAgent] })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: { status: "Inactive" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.third_party_agent.status).toBe("Inactive")

    const updateCall = queryMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].startsWith("UPDATE third_party_agents"),
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![0]).toContain("status = $")
    expect(updateCall![0]).not.toContain("name = $")
  })

  it("returns 403 when super admin attempts to edit", async () => {
    assertNotSuperAdminMock.mockReturnValue({
      ok: false,
      error: SUPER_ADMIN_WRITE_BLOCKED,
      message: "Super admins are not allowed to edit or modify data.",
    })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: jest.fn() }))

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: { status: "Inactive" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe(SUPER_ADMIN_WRITE_BLOCKED)
  })

  it("returns 403 when branch is inactive", async () => {
    assertBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "branch_inactive",
      status: "Inactive",
    })

    const queryMock = jest.fn().mockResolvedValueOnce({ rows: [existingAgent] })
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: { phone: "+256711111111" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe("branch_inactive")
    expect(body.branch_status).toBe("Inactive")
  })

  it("returns 403 when editing a non-status field on an inactive agent", async () => {
    const inactiveAgent = { ...existingAgent, status: "Inactive" }
    const queryMock = jest.fn().mockResolvedValueOnce({ rows: [inactiveAgent] })
    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: { phone: "+256711111111" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe("third_party_agent_inactive")
    expect(body.agent_status).toBe("Inactive")
  })

  it("allows status-only PATCH to reactivate an inactive agent", async () => {
    const inactiveAgent = { ...existingAgent, status: "Inactive" }
    const reactivated = { ...updatedAgent, status: "Active" }
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({ rows: [inactiveAgent] })
      .mockResolvedValueOnce({ rows: [reactivated] })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: { status: "Active" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.third_party_agent.status).toBe("Active")
  })

  it("dispatches update notifications after a successful save", async () => {
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({ rows: [existingAgent] })
      .mockResolvedValueOnce({ rows: [updatedAgent] })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/third-party-agents/${AGENT_ID}`, {
      method: "PATCH",
      body: { status: "Inactive" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: AGENT_ID }) })

    expect(res.status).toBe(200)
    expect(runWithoutAuthMock).toHaveBeenCalled()
    expect(notifyThirdPartyAgentUpdatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          id: STAFF_ID,
          institution_id: INSTITUTION_ID,
          branch_id: BRANCH_ID,
        },
        agent: {
          id: AGENT_ID,
          name: "Acme Finance",
        },
        updatedFields: ["status"],
      }),
    )
  })
})
