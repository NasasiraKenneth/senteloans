import { GET, POST } from "@/app/api/institution/account-types/route"
import { GET as GET_DETAIL, PUT } from "@/app/api/institution/account-types/[id]/route"
import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
}))

jest.mock("@/lib/api/rbac", () => ({
  resolveActorContext: jest.fn(),
  hasPermission: jest.fn(),
  isSuperAdmin: jest.fn(),
}))

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

jest.mock("@/lib/staff/staff-status", () => ({
  assertActorActive: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

const { resolveActorContext, hasPermission, isSuperAdmin } = require("@/lib/api/rbac")
const { assertBranchActive } = require("@/lib/branches/branch-status")
const { assertActorActive } = require("@/lib/staff/staff-status")

describe("Account Types API", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { authUserId: "auth-123", type: "staff" },
    })
  })

  describe("GET /api/institution/account-types", () => {
    it("returns account types list for staff member", async () => {
      const mockActor = { id: "user-1", institution_id: "inst-1", branch_id: "branch-1" }
      ;(runWithAuth as jest.Mock).mockImplementation(async (authId, callback) => {
        resolveActorContext.mockResolvedValue(mockActor)
        hasPermission.mockResolvedValue(true)
        isSuperAdmin.mockReturnValue(false)

        const client = {
          query: jest.fn().mockResolvedValue({
            rows: [
              {
                id: "at-1",
                institution_id: "inst-1",
                branch_id: "branch-1",
                account_name: "Voluntary",
                status: "Active",
                auto_bill_savings: "false",
                accounts_count: 5,
              },
            ],
          }),
        }
        return callback(client)
      })

      const req = new Request("http://localhost/api/institution/account-types")
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.accountTypes).toHaveLength(1)
      expect(data.accountTypes[0].account_name).toBe("Voluntary")
      expect(data.accountTypes[0].auto_bill_savings).toBe("false")
    })
  })

  describe("POST /api/institution/account-types", () => {
    it("creates a new account type with auto_bill_savings", async () => {
      const mockActor = { id: "user-1", institution_id: "inst-1", branch_id: "branch-1" }
      ;(runWithAuth as jest.Mock).mockImplementation(async (authId, callback) => {
        resolveActorContext.mockResolvedValue(mockActor)
        assertActorActive.mockResolvedValue({ ok: true })
        hasPermission.mockResolvedValue(true)
        isSuperAdmin.mockReturnValue(false)
        assertBranchActive.mockResolvedValue({
          ok: true,
          branch: { institution_id: "inst-1" },
        })

        const client = {
          query: jest.fn().mockImplementation((queryText, params) => {
            if (queryText.includes("SELECT id, status FROM account_type")) {
              return { rows: [] }
            }
            if (queryText.includes("INSERT INTO account_type")) {
              return {
                rows: [
                  {
                    id: "at-new",
                    institution_id: params[0],
                    branch_id: params[1],
                    account_name: params[2],
                    status: params[3],
                    auto_bill_savings: params[4],
                  },
                ],
              }
            }
            return { rows: [] }
          }),
        }
        return callback(client)
      })

      const req = new Request("http://localhost/api/institution/account-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: "Fixed Deposit",
          status: "Active",
          auto_bill_savings: "true",
        }),
      })

      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.ok).toBe(true)
      expect(data.accountType.account_name).toBe("Fixed Deposit")
      expect(data.accountType.auto_bill_savings).toBe("true")
    })

    it("returns 400 if account name is missing", async () => {
      const req = new Request("http://localhost/api/institution/account-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: "" }),
      })

      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("account_name_required")
    })
  })

  describe("PUT /api/institution/account-types/[id]", () => {
    it("updates account type details and auto_bill_savings", async () => {
      const mockActor = { id: "user-1", institution_id: "inst-1", branch_id: "branch-1" }
      ;(runWithAuth as jest.Mock).mockImplementation(async (authId, callback) => {
        resolveActorContext.mockResolvedValue(mockActor)
        assertActorActive.mockResolvedValue({ ok: true })
        hasPermission.mockResolvedValue(true)
        isSuperAdmin.mockReturnValue(false)

        const client = {
          query: jest.fn().mockImplementation((queryText, params) => {
            if (queryText.includes("FROM account_type WHERE id = $1")) {
              return {
                rows: [
                  {
                    id: "at-1",
                    institution_id: "inst-1",
                    branch_id: "branch-1",
                    account_name: "Voluntary",
                    status: "Active",
                    auto_bill_savings: "false",
                  },
                ],
              }
            }
            if (queryText.includes("UPDATE account_type")) {
              return {
                rows: [
                  {
                    id: "at-1",
                    institution_id: "inst-1",
                    branch_id: "branch-1",
                    account_name: params[0] || "Voluntary",
                    status: params[1] || "Active",
                    auto_bill_savings: params[2] || "true",
                  },
                ],
              }
            }
            return { rows: [] }
          }),
        }
        return callback(client)
      })

      const req = new Request("http://localhost/api/institution/account-types/at-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: "Voluntary Savings Updated",
          auto_bill_savings: "true",
        }),
      })

      const res = await PUT(req, { params: Promise.resolve({ id: "at-1" }) })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.accountType.account_name).toBe("Voluntary Savings Updated")
      expect(data.accountType.auto_bill_savings).toBe("true")
    })
  })
})
