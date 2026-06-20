import { GET as GET_KYC, POST as POST_KYC } from "@/app/api/institution/members/[id]/kyc/route"
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

jest.mock("@/lib/notifications/kyc-events", () => ({
  notifyKycUploaded: jest.fn().mockResolvedValue({ ok: true, memberNotifications: 1, staffNotifications: 0, errors: [] }),
}))

jest.mock("@/lib/email/kyc-emails", () => ({
  enqueueKycUploadedEmail: jest.fn().mockResolvedValue({ enqueued: [], skipped: [], errors: [] }),
}))

import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { assertNotSuperAdmin, hasPermission, resolveActorContext } from "@/lib/api/rbac"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { notifyKycUploaded } from "@/lib/notifications/kyc-events"
import { enqueueKycUploadedEmail } from "@/lib/email/kyc-emails"

const notifyKycUploadedMock = notifyKycUploaded as jest.Mock
const enqueueKycUploadedEmailMock = enqueueKycUploadedEmail as jest.Mock

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const assertMemberAndBranchActiveMock = assertMemberAndBranchActive as jest.Mock

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
}

describe("GET /api/institution/members/[id]/kyc", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
    hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission === "view_members")
  })

  it("returns 401 when unauthenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_KYC(mockNextRequest("http://localhost/api/institution/members/member-1/kyc"), {
      params: Promise.resolve({ id: MEMBER_ID }),
    })

    expect(response.status).toBe(401)
  })

  it("returns verified KYC docs for the member", async () => {
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({
        query: jest.fn(async (sql: string) => {
          if (sql.includes("FROM members")) return { rows: [{ id: MEMBER_ID }] }
          if (sql.includes("FROM member_kyc_docs")) {
            return {
              rows: [
                {
                  doc_type: "passport",
                  passport_photo: "https://example.com/photo.jpg",
                  document_front: "https://example.com/biodata.jpg",
                  document_back: null,
                  status: "verified",
                },
              ],
            }
          }
          return { rows: [] }
        }),
      }),
    )

    const response = await GET_KYC(mockNextRequest("http://localhost/api/institution/members/member-1/kyc"), {
      params: Promise.resolve({ id: MEMBER_ID }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.docs.passportPhoto).toBe("https://example.com/photo.jpg")
    expect(body.docs.passportBiodataPage).toBe("https://example.com/biodata.jpg")
    expect(assertMemberAndBranchActiveMock).toHaveBeenCalled()
  })

  it("returns 403 when member is inactive", async () => {
    assertMemberAndBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "member_inactive",
      memberStatus: "Suspended",
    })

    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({ query: jest.fn(async () => ({ rows: [] })) }),
    )

    const response = await GET_KYC(mockNextRequest("http://localhost/api/institution/members/member-1/kyc"), {
      params: Promise.resolve({ id: MEMBER_ID }),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe("member_inactive")
    expect(body.member_status).toBe("Suspended")
  })

  it("returns 403 when branch is inactive", async () => {
    assertMemberAndBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "branch_inactive",
      branchStatus: "Inactive",
    })

    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({ query: jest.fn(async () => ({ rows: [] })) }),
    )

    const response = await GET_KYC(mockNextRequest("http://localhost/api/institution/members/member-1/kyc"), {
      params: Promise.resolve({ id: MEMBER_ID }),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe("branch_inactive")
    expect(body.branch_status).toBe("Inactive")
  })
})

describe("POST /api/institution/members/[id]/kyc", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupAuth()
    hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) =>
      permission === "edit_kyc" || permission === "view_members",
    )
    runWithoutAuthMock.mockImplementation(async (fn: (client: unknown) => unknown) => fn({ query: jest.fn() }))
  })

  it("returns 400 for invalid payload", async () => {
    const request = mockNextRequest("http://localhost/api/institution/members/member-1/kyc", {
      method: "POST",
      body: { uploads: [] },
    })

    const response = await POST_KYC(request, { params: Promise.resolve({ id: MEMBER_ID }) })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Invalid payload")
  })

  it("batch uploads KYC documents as pending_review and notifies when complete", async () => {
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({
        query: jest.fn(async (sql: string) => {
          const s = sql.toLowerCase()
          if (s.includes("from institutions")) return { rows: [{ name: "Test SACCO" }] }
          if (s.includes("select id") && s.includes("member_kyc_docs")) return { rows: [] }
          if (s.includes("insert into member_kyc_docs")) return { rows: [{ id: "doc-1" }] }
          if (s.includes("update member_kyc_docs")) return { rows: [{ id: "doc-1" }] }
          if (s.includes("from member_kyc_docs")) {
            return {
              rows: [{
                doc_type: "national_id",
                passport_photo: "https://example.com/photo.jpg",
                document_front: "https://example.com/front.jpg",
                document_back: "https://example.com/back.jpg",
                status: "verified",
              }],
            }
          }
          return { rows: [] }
        }),
      }),
    )

    const request = mockNextRequest("http://localhost/api/institution/members/member-1/kyc", {
      method: "POST",
      body: {
        uploads: [
          { field: "passport_photo", url: "https://example.com/photo.jpg" },
          { field: "national_id_front", url: "https://example.com/front.jpg" },
          { field: "national_id_back", url: "https://example.com/back.jpg" },
        ],
      },
    })

    const response = await POST_KYC(request, { params: Promise.resolve({ id: MEMBER_ID }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.saved).toHaveLength(3)
    expect(body.docs.nationalIdFront).toBe("https://example.com/front.jpg")
    expect(assertMemberAndBranchActiveMock).toHaveBeenCalled()
    expect(notifyKycUploadedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        readyForReview: true,
        docType: "national_id",
      }),
    )
    expect(enqueueKycUploadedEmailMock).toHaveBeenCalledTimes(1)
  })

  it("does not notify when the uploaded doc set is incomplete", async () => {
    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({
        query: jest.fn(async (sql: string) => {
          const s = sql.toLowerCase()
          if (s.includes("from institutions")) return { rows: [{ name: "Test SACCO" }] }
          if (s.includes("select id") && s.includes("member_kyc_docs")) return { rows: [] }
          if (s.includes("insert into member_kyc_docs")) return { rows: [{ id: "doc-1" }] }
          if (s.includes("from member_kyc_docs")) {
            return {
              rows: [{
                doc_type: "national_id",
                passport_photo: "https://example.com/photo.jpg",
                document_front: null,
                document_back: null,
                status: "pending_review",
              }],
            }
          }
          return { rows: [] }
        }),
      }),
    )

    const request = mockNextRequest("http://localhost/api/institution/members/member-1/kyc", {
      method: "POST",
      body: { docType: "passport_photo", url: "https://example.com/photo.jpg" },
    })

    const response = await POST_KYC(request, { params: Promise.resolve({ id: MEMBER_ID }) })

    expect(response.status).toBe(200)
    expect(notifyKycUploadedMock).not.toHaveBeenCalled()
    expect(enqueueKycUploadedEmailMock).not.toHaveBeenCalled()
  })

  it("returns 403 when member is inactive", async () => {
    assertMemberAndBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "member_inactive",
      memberStatus: "Inactive",
    })

    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({ query: jest.fn(async () => ({ rows: [] })) }),
    )

    const request = mockNextRequest("http://localhost/api/institution/members/member-1/kyc", {
      method: "POST",
      body: { docType: "passport_photo", url: "https://example.com/photo.jpg" },
    })

    const response = await POST_KYC(request, { params: Promise.resolve({ id: MEMBER_ID }) })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe("member_inactive")
    expect(body.member_status).toBe("Inactive")
  })

  it("returns 403 when branch is inactive", async () => {
    assertMemberAndBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "branch_inactive",
      branchStatus: "Closed",
    })

    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({ query: jest.fn(async () => ({ rows: [] })) }),
    )

    const request = mockNextRequest("http://localhost/api/institution/members/member-1/kyc", {
      method: "POST",
      body: { docType: "passport_photo", url: "https://example.com/photo.jpg" },
    })

    const response = await POST_KYC(request, { params: Promise.resolve({ id: MEMBER_ID }) })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe("branch_inactive")
    expect(body.branch_status).toBe("Closed")
  })

  it("returns 403 without edit_kyc permission", async () => {
    hasPermissionMock.mockImplementation(async (_client, _actor, permission: string) => permission !== "edit_kyc")

    runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (client: unknown) => unknown) =>
      fn({ query: jest.fn(async () => ({ rows: [] })) }),
    )

    const request = mockNextRequest("http://localhost/api/institution/members/member-1/kyc", {
      method: "POST",
      body: { docType: "passport_photo", url: "https://example.com/photo.jpg" },
    })

    const response = await POST_KYC(request, { params: Promise.resolve({ id: MEMBER_ID }) })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe("missing_permission:edit_kyc")
  })
})
