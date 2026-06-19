import { GET as GET_ME } from "@/app/api/client/me/route"
import { PUT as PUT_PROFILE } from "@/app/api/client/profile/route"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
  runWithoutAuth: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import {
  AUTH_USER_ID,
  clientSession,
  createPgMock,
  defaultMemberRow,
  INSTITUTION_ID,
  MEMBER_ID,
  normalizeSql,
} from "../utils/client-api-test-helpers"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock

function setupPg(pg = createPgMock()) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof pg) => unknown) => fn(pg))
  return pg
}

describe("GET /api/client/me", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const response = await GET_ME()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const response = await GET_ME()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("fetches client profile with institution context", async () => {
    setupPg()

    const response = await GET_ME()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.client.id).toBe(MEMBER_ID)
    expect(body.client.fullName).toBe("John Doe")
    expect(body.client.clientNumber).toBe("MEM-001")
    expect(body.institution.id).toBe(INSTITUTION_ID)
    expect(body.institution.name).toBe("Test SACCO")
    expect(body.institution.config).toEqual({
      modules: {
        loans: true,
        shares: true,
        savings: true,
        mobile_money: true,
      },
      currency: "UGX",
      clientTerminology: "Member",
    })
  })
})

describe("PUT /api/client/profile", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(clientSession)
  })

  it("returns 401 if user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const request = new Request("http://localhost:3000/api/client/profile", {
      method: "PUT",
      body: JSON.stringify({ village: "Kampala" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PUT_PROFILE(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 404 if member record not found", async () => {
    setupPg(createPgMock({ member: null }))

    const request = new Request("http://localhost:3000/api/client/profile", {
      method: "PUT",
      body: JSON.stringify({ village: "Kampala" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PUT_PROFILE(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe("client_not_found")
  })

  it("returns 400 for invalid phone number", async () => {
    setupPg()

    const request = new Request("http://localhost:3000/api/client/profile", {
      method: "PUT",
      body: JSON.stringify({ nextOfKinPhone: "invalid-phone" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PUT_PROFILE(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("invalid_next_of_kin_phone")
  })

  it("returns 400 for too long fields", async () => {
    setupPg()

    const request = new Request("http://localhost:3000/api/client/profile", {
      method: "PUT",
      body: JSON.stringify({ village: "a".repeat(501) }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PUT_PROFILE(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain("location_too_long")
  })

  it("updates profile fields", async () => {
    const pg = setupPg(
      createPgMock({
        onQuery: (sql) => {
          const s = normalizeSql(sql)
          if (s.includes("from members where id = $1") && s.includes("village")) {
            return {
              rows: [
                {
                  id: MEMBER_ID,
                  village: "Entebbe",
                  district: "Wakiso",
                  occupation: "Engineer",
                  next_of_kin_name: defaultMemberRow.next_of_kin_name,
                  next_of_kin_relationship: defaultMemberRow.next_of_kin_relationship,
                  next_of_kin_phone: defaultMemberRow.next_of_kin_phone,
                },
              ],
            }
          }
          return undefined
        },
      }),
    )

    const request = new Request("http://localhost:3000/api/client/profile", {
      method: "PUT",
      body: JSON.stringify({
        village: "Entebbe",
        district: "Wakiso",
        occupation: "Engineer",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PUT_PROFILE(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(true)
    expect(body.profile.village).toBe("Entebbe")
    expect(pg.query).toHaveBeenCalled()
  })

  it("returns ok without update if no changes", async () => {
    setupPg()

    const request = new Request("http://localhost:3000/api/client/profile", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })

    const response = await PUT_PROFILE(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(false)
  })
})
