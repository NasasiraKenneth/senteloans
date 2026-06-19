import { POST as POST_CHANGE_PASSWORD } from "@/app/api/client/security/change-password/route"
import { POST as POST_REPLACE_KYC } from "@/app/api/client/kyc-docs/replace/route"
import { POST as POST_CANCEL_KYC } from "@/app/api/client/kyc-docs/cancel/route"
import { GET as GET_SEARCH_GUARANTORS } from "@/app/api/client/search-guarantors/route"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn(),
}))

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("hashed-new-password"),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/kyc-events", () => ({
  notifyKycSubmitted: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("@/lib/email/kyc-emails", () => ({
  enqueueKycSubmittedEmail: jest.fn().mockResolvedValue({ enqueued: [], skipped: [], errors: [] }),
}))

import { compare } from "bcryptjs"
import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import {
  clientSession,
  createPgMock,
  defaultMemberRow,
  INSTITUTION_ID,
  MEMBER_ID,
  normalizeSql,
} from "../utils/client-api-test-helpers"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const compareMock = compare as jest.Mock

function setupPg(pg = createPgMock()) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof pg) => unknown) => fn(pg))
  runWithoutAuthMock.mockImplementation(async (fn: (c: typeof pg) => unknown) => fn(pg))
  return pg
}

describe("POST /api/client/security/change-password", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
    compareMock.mockResolvedValue(true)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/security/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "oldpass123",
        newPassword: "newpass123",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CHANGE_PASSWORD(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 400 if current password is missing", async () => {
    const request = new Request("http://localhost:3000/api/client/security/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword: "newpass123" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CHANGE_PASSWORD(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("current_password_required")
  })

  it("returns 400 if new password is too short", async () => {
    const request = new Request("http://localhost:3000/api/client/security/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "oldpass123",
        newPassword: "short",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CHANGE_PASSWORD(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("new_password_too_short")
  })

  it("returns 400 if current password is invalid", async () => {
    compareMock.mockResolvedValue(false)
    setupPg()

    const request = new Request("http://localhost:3000/api/client/security/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "wrongpass",
        newPassword: "newpass123",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CHANGE_PASSWORD(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("invalid_current_password")
  })

  it("changes password successfully", async () => {
    const pg = setupPg()

    const request = new Request("http://localhost:3000/api/client/security/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "oldpass123",
        newPassword: "newpass123",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CHANGE_PASSWORD(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(pg.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE app_auth_users"),
      expect.arrayContaining(["hashed-new-password", clientSession.user.authUserId]),
    )
  })
})

describe("POST /api/client/kyc-docs/replace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/kyc-docs/replace", {
      method: "POST",
      body: JSON.stringify({
        docType: "passport_photo",
        url: "https://example.com/photo.jpg",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_REPLACE_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 400 for invalid document type", async () => {
    const request = new Request("http://localhost:3000/api/client/kyc-docs/replace", {
      method: "POST",
      body: JSON.stringify({
        docType: "invalid_type",
        url: "https://example.com/photo.jpg",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_REPLACE_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("invalid_doc_type")
  })

  it("returns 400 if URL is missing", async () => {
    const request = new Request("http://localhost:3000/api/client/kyc-docs/replace", {
      method: "POST",
      body: JSON.stringify({ docType: "passport_photo" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_REPLACE_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("url_required")
  })

  it("replaces KYC document successfully", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("insert into member_kyc_docs")) {
            return { rows: [{ id: "kyc-doc-1", created_at: new Date().toISOString() }] }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/kyc-docs/replace", {
      method: "POST",
      body: JSON.stringify({
        docType: "passport_photo",
        url: "https://example.com/new-photo.jpg",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_REPLACE_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.pendingId).toBe("kyc-doc-1")
  })
})

describe("POST /api/client/kyc-docs/cancel", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/kyc-docs/cancel", {
      method: "POST",
      body: JSON.stringify({ pendingId: "pending-1" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CANCEL_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 400 if pending document is not in pending_review status", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from member_kyc_docs where id = $1")) {
            return {
              rows: [
                {
                  id: "pending-1",
                  member_id: MEMBER_ID,
                  institution_id: INSTITUTION_ID,
                  status: "approved",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/kyc-docs/cancel", {
      method: "POST",
      body: JSON.stringify({ pendingId: "pending-1" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CANCEL_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("not_pending")
  })

  it("returns 403 if document belongs to different member", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from member_kyc_docs where id = $1")) {
            return {
              rows: [
                {
                  id: "pending-1",
                  member_id: "other-member",
                  institution_id: INSTITUTION_ID,
                  status: "pending_review",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/kyc-docs/cancel", {
      method: "POST",
      body: JSON.stringify({ pendingId: "pending-1" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CANCEL_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe("forbidden")
  })

  it("cancels pending KYC document successfully", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from member_kyc_docs where id = $1")) {
            return {
              rows: [
                {
                  id: "pending-1",
                  member_id: MEMBER_ID,
                  institution_id: INSTITUTION_ID,
                  status: "pending_review",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/kyc-docs/cancel", {
      method: "POST",
      body: JSON.stringify({ pendingId: "pending-1" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST_CANCEL_KYC(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
  })
})

describe("GET /api/client/search-guarantors", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/search-guarantors?q=john")
    const response = await GET_SEARCH_GUARANTORS(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const request = new Request("http://localhost:3000/api/client/search-guarantors?q=john")
    const response = await GET_SEARCH_GUARANTORS(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("requires at least 2 characters", async () => {
    setupPg()

    const request = new Request("http://localhost:3000/api/client/search-guarantors?q=j")
    const response = await GET_SEARCH_GUARANTORS(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.guarantors).toEqual([])
    expect(body.message).toContain("at least 2 characters")
  })

  it("searches for guarantors and excludes self", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from members where institution_id = $1 and status = 'active'")) {
            return {
              rows: [
                {
                  id: "client-2",
                  full_name: "John Doe",
                  phone_number: "+256700000001",
                  member_number: "MEM-002",
                  kyc_status: "Verified",
                },
                {
                  id: "client-3",
                  full_name: "Jane Doe",
                  phone_number: "+256700000002",
                  member_number: "MEM-003",
                  kyc_status: "Verified",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/search-guarantors?q=doe")
    const response = await GET_SEARCH_GUARANTORS(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.guarantors).toHaveLength(2)
    expect(body.guarantors[0].full_name).toBe("John Doe")
    expect(body.guarantors[0].member_number).toBe("MEM-002")
  })

  it("filters to only verified KYC members", async () => {
    setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from members where institution_id = $1 and status = 'active'")) {
            return {
              rows: [
                {
                  id: "client-2",
                  full_name: "John Doe",
                  phone_number: "+256700000001",
                  member_number: "MEM-002",
                  kyc_status: "Verified",
                },
                {
                  id: "client-3",
                  full_name: "Jane Doe",
                  phone_number: "+256700000002",
                  member_number: "MEM-003",
                  kyc_status: "Pending",
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/search-guarantors?q=doe")
    const response = await GET_SEARCH_GUARANTORS(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.guarantors).toHaveLength(1)
    expect(body.guarantors[0].full_name).toBe("John Doe")
  })
})
