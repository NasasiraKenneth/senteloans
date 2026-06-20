import { PATCH } from "@/app/api/institution/members/[id]/route"
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
  }
})

jest.mock("@/lib/members/member-status", () => {
  const actual = jest.requireActual("@/lib/members/member-status")
  return {
    ...actual,
    assertMemberAndBranchActive: jest.fn(),
  }
})

jest.mock("@/lib/email/seed-member-preferences", () => ({
  syncMemberEmailPreferences: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/member-events", () => ({
  notifyMemberProfileUpdated: jest.fn().mockResolvedValue({
    ok: true,
    memberNotifications: 1,
    staffNotifications: 2,
    errors: [],
  }),
}))

import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { assertNotSuperAdmin, hasPermission, resolveActorContext } from "@/lib/api/rbac"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { notifyMemberProfileUpdated } from "@/lib/notifications/member-events"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const assertMemberAndBranchActiveMock = assertMemberAndBranchActive as jest.Mock
const notifyMemberProfileUpdatedMock = notifyMemberProfileUpdated as jest.Mock

const MEMBER_ID = "member-1"
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
  role: "manager",
}

const activeMember = {
  id: MEMBER_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  full_name: "Jane Doe",
  member_number: "M001",
  email: "jane@example.com",
  status: "Active" as const,
}

function setupAuth() {
  getServerSessionMock.mockResolvedValue(staffSession)
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  assertMemberAndBranchActiveMock.mockResolvedValue({ ok: true, member: activeMember })
  hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission === "edit_member")
  runWithoutAuthMock.mockImplementation(async (fn) => fn({ query: jest.fn() }))
}

describe("PATCH /api/institution/members/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
  })

  it("rejects kycStatus in body without applying it", async () => {
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({ rows: [{ kyc_status: "Pending" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: MEMBER_ID }] })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/members/${MEMBER_ID}`, {
      method: "PATCH",
      body: {
        fullName: "Jane Doe",
        phoneNumber: "+256701234567",
        kycStatus: "Verified",
      },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: MEMBER_ID }) })
    expect(res.status).toBe(200)

    const updateCall = queryMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].startsWith("UPDATE members"),
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![0]).not.toContain("kyc_status")
    expect(updateCall![0]).not.toContain("kyc_approved_by")
  })

  it("returns 403 when member is inactive", async () => {
    assertMemberAndBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "member_inactive",
      memberStatus: "Suspended",
    })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: jest.fn() }))

    const req = mockNextRequest(`http://localhost/api/institution/members/${MEMBER_ID}`, {
      method: "PATCH",
      body: { fullName: "Jane Doe", phoneNumber: "+256701234567" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: MEMBER_ID }) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("member_inactive")
    expect(body.member_status).toBe("Suspended")
  })

  it("uses assertMemberAndBranchActive write gate before updating", async () => {
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({ rows: [{ kyc_status: "Pending" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: MEMBER_ID }] })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/members/${MEMBER_ID}`, {
      method: "PATCH",
      body: { notes: "Updated note", phoneNumber: "+256701234567", fullName: "Jane Doe" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: MEMBER_ID }) })
    expect(res.status).toBe(200)
    expect(assertMemberAndBranchActiveMock).toHaveBeenCalledWith(
      expect.anything(),
      MEMBER_ID,
      INSTITUTION_ID,
    )
  })

  it("dispatches profile update notifications after a successful save", async () => {
    const queryMock = jest.fn()
    queryMock
      .mockResolvedValueOnce({ rows: [{ kyc_status: "Pending" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: MEMBER_ID }] })

    runWithAuthMock.mockImplementation(async (_authUserId, fn) => fn({ query: queryMock }))

    const req = mockNextRequest(`http://localhost/api/institution/members/${MEMBER_ID}`, {
      method: "PATCH",
      body: { notes: "Updated note", phoneNumber: "+256701234567", fullName: "Jane Doe" },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: MEMBER_ID }) })
    expect(res.status).toBe(200)
    expect(runWithoutAuthMock).toHaveBeenCalled()
    expect(notifyMemberProfileUpdatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          id: STAFF_ID,
          institution_id: INSTITUTION_ID,
          branch_id: BRANCH_ID,
        },
        member: {
          id: MEMBER_ID,
          full_name: "Jane Doe",
          member_number: "M001",
        },
        updatedFields: expect.arrayContaining(["notes", "phone_number", "full_name"]),
      }),
    )
  })
})
