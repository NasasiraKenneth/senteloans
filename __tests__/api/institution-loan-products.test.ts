import { GET, POST } from "@/app/api/institution/loan-products/route"
import { GET as GET_BY_ID, PUT } from "@/app/api/institution/loan-products/[id]/route"

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("@/lib/db", () => ({
  runWithAuth: jest.fn(),
}))

jest.mock("@/lib/staff/staff-status", () => ({
  assertActorActive: jest.fn(),
}))

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

import { getServerSession } from "next-auth"
import { runWithAuth } from "@/lib/db"
import { assertActorActive } from "@/lib/staff/staff-status"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { auditLogger } from "@/lib/audit/audit-logger"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const assertActorActiveMock = assertActorActive as jest.Mock
const assertBranchActiveMock = assertBranchActive as jest.Mock
const auditLoggerMock = auditLogger as jest.Mocked<typeof auditLogger>

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111"
const BRANCH_ID = "22222222-2222-2222-2222-222222222222"
const OTHER_BRANCH_ID = "33333333-3333-3333-3333-333333333333"
const STAFF_ID = "staff-1"
const AUTH_USER_ID = "auth-user-1"
const PRODUCT_ID = "44444444-4444-4444-4444-444444444444"

const staffSession = {
  user: { authUserId: AUTH_USER_ID, type: "staff" },
}

const actor = {
  id: STAFF_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  role_id: "role-1",
  role: "manager",
  status: "Active",
}

const superAdminActor = {
  id: STAFF_ID,
  institution_id: INSTITUTION_ID,
  branch_id: null,
  role_id: "role-sa",
  role: "super_admin",
  status: "Active",
}

const mockProduct = {
  id: PRODUCT_ID,
  branch_id: BRANCH_ID,
  product_name: "Personal Loan",
  product_code: "KS-PL-001",
  description: "Quick personal loans",
  minimum_amount: 100000,
  maximum_amount: 5000000,
  interest_rate: 15.5,
  minimum_tenure_months: 3,
  maximum_tenure_months: 24,
  interest_calculation_method: "reducing_balance",
  collateral_required: false,
  guarantors_required: 2,
  processing_fee_percentage: 2,
  insurance_required: false,
  status: "Active",
  eligibilities: [],
}

const mockProductWithInstitution = {
  ...mockProduct,
  institution_id: INSTITUTION_ID,
  institution_name: "Kampala SACCO",
}

const validBody = {
  product_name: "Personal Loan",
  product_code: "PL",
  description: "Quick personal loans",
  minimum_amount: 100000,
  maximum_amount: 5000000,
  interest_rate: 15.5,
  minimum_tenure_months: 3,
  maximum_tenure_months: 24,
  interest_calculation_method: "reducing_balance",
  collateral_required: false,
  guarantors_required: 2,
  processing_fee_percentage: 2,
  insurance_required: false,
  status: "Active",
  eligibilities: [{ eligibility: "Salaried", status: "Active" }],
}

function getRequest(url = "http://localhost/api/institution/loan-products") {
  return new Request(url)
}

function postRequest(body: Record<string, unknown> = validBody) {
  return new Request("http://localhost/api/institution/loan-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function getByIdRequest(productId = PRODUCT_ID) {
  return new Request(`http://localhost/api/institution/loan-products/${productId}`)
}

function putRequest(body: Record<string, unknown> = validBody, productId = PRODUCT_ID) {
  return new Request(`http://localhost/api/institution/loan-products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const routeParams = (productId = PRODUCT_ID) => ({ params: Promise.resolve({ id: productId }) })

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function createMockClient(options?: {
  actor?: typeof actor | typeof superAdminActor
  hasViewPermission?: boolean
  hasCreatePermission?: boolean
  hasEditPermission?: boolean
  actorMissingInstitution?: boolean
  listRows?: typeof mockProduct[]
  listTotal?: number
  detailProduct?: typeof mockProduct | null
  detailProductWithInstitution?: typeof mockProductWithInstitution | null
  updateRowCount?: number
}) {
  const currentActor = options?.actor ?? actor
  const hasViewPermission = options?.hasViewPermission !== false
  const hasCreatePermission = options?.hasCreatePermission !== false
  const hasEditPermission = options?.hasEditPermission !== false
  const actorMissingInstitution = options?.actorMissingInstitution === true
  const listRows = options?.listRows ?? [mockProduct]
  const listTotal = options?.listTotal ?? listRows.length
  const detailProduct = options?.detailProduct === null ? null : (options?.detailProduct ?? mockProduct)
  const detailProductWithInstitution =
    options?.detailProductWithInstitution === null
      ? null
      : (options?.detailProductWithInstitution ?? mockProductWithInstitution)
  const updateRowCount = options?.updateRowCount ?? 1

  return {
    query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      const s = normalizeSql(sql)

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 }
      }

      if (s.includes("from users u") && s.includes("auth_id")) {
        return {
          rows: actorMissingInstitution
            ? [{ ...currentActor, institution_id: null }]
            : [currentActor],
        }
      }

      if (s.includes("from role_permissions")) {
        const permission = String(params?.[2] || "")
        const allowed =
          permission === "view_loan_products"
            ? hasViewPermission
            : permission === "create_loan_product"
              ? hasCreatePermission
              : permission === "edit_loan_product"
                ? hasEditPermission
                : true
        return { rows: allowed ? [{}] : [], rowCount: allowed ? 1 : 0 }
      }

      if (s.includes("from loan_products lp") && s.includes("join institutions i")) {
        return { rows: detailProductWithInstitution ? [detailProductWithInstitution] : [] }
      }

      if (s.includes("from loan_products lp") && s.includes("where lp.id")) {
        return { rows: detailProduct ? [detailProduct] : [] }
      }

      if (s.includes("from loan_product_eligibilities") && s.includes("loan_product_id")) {
        return { rows: [{ id: "elig-1", eligibility: "Salaried", status: "Active" }] }
      }

      if (s.includes("update loan_products set")) {
        return { rows: [], rowCount: updateRowCount }
      }

      if (s.includes("delete from loan_product_eligibilities")) {
        return { rows: [], rowCount: 1 }
      }

      if (s.includes("select count(*)::int as c")) {
        return { rows: [{ c: listTotal }] }
      }

      if (s.includes("from loan_products lp") && s.includes("group by lp.id")) {
        return { rows: listRows }
      }

      if (s.includes("from institutions") && s.includes("institution_name")) {
        return { rows: [{ institution_name: "Kampala SACCO" }] }
      }

      if (s.includes("from loan_products") && s.includes("product_code like")) {
        return { rows: [] }
      }

      if (s.includes("insert into loan_products")) {
        return { rows: [{ id: PRODUCT_ID }] }
      }

      if (s.includes("insert into loan_product_eligibilities")) {
        return { rows: [], rowCount: 1 }
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

function setupPostHappyPath(options?: { actor?: typeof actor | typeof superAdminActor; branchId?: string }) {
  const client = createMockClient({ actor: options?.actor })
  setupRunWithAuth(client)

  getServerSessionMock.mockResolvedValue(staffSession)
  assertActorActiveMock.mockResolvedValue({ ok: true })
  assertBranchActiveMock.mockResolvedValue({
    ok: true,
    branch: {
      id: options?.branchId ?? BRANCH_ID,
      institution_id: INSTITUTION_ID,
      name: "HQ",
      status: "Active",
    },
  })

  return client
}

function setupPutHappyPath(options?: { actor?: typeof actor | typeof superAdminActor; branchId?: string }) {
  return setupPostHappyPath(options)
}

describe("GET /api/institution/loan-products", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  it("returns 401 when there is no session", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("unauthorized")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 403 when the session is not staff", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { authUserId: AUTH_USER_ID, type: "client" },
    })

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("not_staff")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 403 when staff lacks view_loan_products permission", async () => {
    const client = createMockClient({ hasViewPermission: false })
    setupRunWithAuth(client)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("missing_permission:view_loan_products")
  })

  it("returns 400 when non-super-admin actor has no branch", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
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

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("actor_branch_missing")
  })

  it("lists loan products for branch-scoped staff", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].product_name).toBe("Personal Loan")
    expect(body.total).toBe(1)
  })

  it("allows super admin to list without an assigned branch", async () => {
    const client = createMockClient({ actor: superAdminActor })
    setupRunWithAuth(client)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(1)
  })

  it("returns empty items when no products match", async () => {
    const client = createMockClient({ listRows: [], listTotal: 0 })
    setupRunWithAuth(client)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(0)
    expect(body.total).toBe(0)
  })
})

describe("POST /api/institution/loan-products", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  describe("validation", () => {
    it("returns 400 when required fields are missing", async () => {
      const res = await POST(postRequest({ ...validBody, product_name: "" }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("Missing required fields")
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
      expect(body.error).toBe("not_staff")
      expect(runWithAuthMock).not.toHaveBeenCalled()
    })

    it("returns 403 when staff lacks create_loan_product permission", async () => {
      const client = createMockClient({ hasCreatePermission: false })
      setupRunWithAuth(client)
      assertActorActiveMock.mockResolvedValue({ ok: true })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("missing_permission:create_loan_product")
    })

    it("returns 403 when actor has no linked institution profile", async () => {
      const client = createMockClient({ actorMissingInstitution: true })
      setupRunWithAuth(client)
      assertActorActiveMock.mockResolvedValue({ ok: true })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("no_app_user_profile")
    })

    it("returns 403 when actor is inactive", async () => {
      setupPostHappyPath()
      assertActorActiveMock.mockResolvedValue({
        ok: false,
        error: "staff_inactive",
        status: "Suspended",
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("staff_inactive")
    })
  })

  describe("branch rules", () => {
    it("returns 400 when non-super-admin actor has no branch", async () => {
      const client = createMockClient()
      setupRunWithAuth(client)
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

      expect(res.status).toBe(400)
      expect(body.error).toBe("actor_branch_missing")
    })

    it("returns 403 when staff tries to create for another branch", async () => {
      setupPostHappyPath()

      const res = await POST(postRequest({ ...validBody, branch_id: OTHER_BRANCH_ID }))
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("cross_branch_operation_forbidden")
      expect(assertBranchActiveMock).not.toHaveBeenCalled()
    })

    it("returns 400 when super admin omits branch_id", async () => {
      setupPostHappyPath({ actor: superAdminActor })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("branch_id_required")
    })

    it("returns 403 when target branch is inactive", async () => {
      setupPostHappyPath()
      assertBranchActiveMock.mockResolvedValue({
        ok: false,
        error: "branch_inactive",
        status: "Suspended",
      })

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBe("branch_inactive")
    })
  })

  describe("success", () => {
    it("creates a loan product for branch-scoped staff", async () => {
      const client = setupPostHappyPath()

      const res = await POST(postRequest())
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.id).toBe(PRODUCT_ID)
      expect(auditLoggerMock.logInsert).toHaveBeenCalled()
      expect(client.query).toHaveBeenCalledWith("BEGIN")
      expect(client.query).toHaveBeenCalledWith("COMMIT")
    })

    it("creates a loan product for super admin when branch_id is supplied", async () => {
      const client = setupPostHappyPath({ actor: superAdminActor, branchId: OTHER_BRANCH_ID })

      const res = await POST(postRequest({ ...validBody, branch_id: OTHER_BRANCH_ID }))
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.id).toBe(PRODUCT_ID)
      expect(assertBranchActiveMock).toHaveBeenCalledWith(expect.anything(), OTHER_BRANCH_ID)
      expect(client.query).toHaveBeenCalledWith("COMMIT")
    })
  })
})

describe("GET /api/institution/loan-products/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  it("returns 401 when there is no session", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const res = await GET_BY_ID(getByIdRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("unauthorized")
  })

  it("returns 403 when staff lacks view_loan_products permission", async () => {
    const client = createMockClient({ hasViewPermission: false })
    setupRunWithAuth(client)

    const res = await GET_BY_ID(getByIdRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("missing_permission:view_loan_products")
  })

  it("returns 400 when non-super-admin actor has no branch", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
    client.query.mockImplementation(async (sql: string) => {
      const s = normalizeSql(sql)
      if (s.includes("from users u") && s.includes("auth_id")) {
        return { rows: [{ ...actor, branch_id: null }] }
      }
      return { rows: [], rowCount: 0 }
    })

    const res = await GET_BY_ID(getByIdRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("actor_branch_missing")
  })

  it("returns a scoped product with eligibilities", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)

    const res = await GET_BY_ID(getByIdRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.product.product_name).toBe("Personal Loan")
    expect(body.product.eligibilities).toHaveLength(1)
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM loan_products lp"),
      expect.arrayContaining([PRODUCT_ID]),
    )
  })

  it("returns 404 when the product is out of scope", async () => {
    const client = createMockClient({ detailProduct: null })
    setupRunWithAuth(client)

    const res = await GET_BY_ID(getByIdRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("product_not_found")
  })

  it("allows super admin to fetch without an assigned branch", async () => {
    const client = createMockClient({ actor: superAdminActor })
    setupRunWithAuth(client)

    const res = await GET_BY_ID(getByIdRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.product.product_name).toBe("Personal Loan")
  })
})

describe("PUT /api/institution/loan-products/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  it("returns 400 when required fields are missing", async () => {
    const res = await PUT(putRequest({ ...validBody, product_name: "" }), routeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Missing required fields")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 403 when staff lacks edit_loan_product permission", async () => {
    const client = createMockClient({ hasEditPermission: false })
    setupRunWithAuth(client)
    assertActorActiveMock.mockResolvedValue({ ok: true })

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("missing_permission:edit_loan_product")
  })

  it("returns 400 when non-super-admin actor has no branch", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
    assertActorActiveMock.mockResolvedValue({ ok: true })
    client.query.mockImplementation(async (sql: string) => {
      const s = normalizeSql(sql)
      if (s.includes("from users u") && s.includes("auth_id")) {
        return { rows: [{ ...actor, branch_id: null }] }
      }
      return { rows: [], rowCount: 0 }
    })

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("actor_branch_missing")
  })

  it("returns 403 when actor is inactive", async () => {
    setupPutHappyPath()
    assertActorActiveMock.mockResolvedValue({
      ok: false,
      error: "staff_inactive",
      status: "Suspended",
    })

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("staff_inactive")
  })

  it("returns 403 when product branch is inactive", async () => {
    setupPutHappyPath()
    assertBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "branch_inactive",
      status: "Suspended",
    })

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("branch_inactive")
  })

  it("returns 404 when the product is out of scope", async () => {
    const client = createMockClient({ detailProductWithInstitution: null })
    setupRunWithAuth(client)
    assertActorActiveMock.mockResolvedValue({ ok: true })
    assertBranchActiveMock.mockResolvedValue({
      ok: true,
      branch: { id: BRANCH_ID, institution_id: INSTITUTION_ID, name: "HQ", status: "Active" },
    })

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("Product not found")
  })

  it("updates a loan product for branch-scoped staff", async () => {
    const client = setupPutHappyPath()

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(assertBranchActiveMock).toHaveBeenCalledWith(expect.anything(), BRANCH_ID)
    expect(auditLoggerMock.logUpdate).toHaveBeenCalled()
    expect(client.query).toHaveBeenCalledWith("COMMIT")
  })

  it("updates a loan product for super admin without an assigned branch", async () => {
    const client = setupPutHappyPath({ actor: superAdminActor, branchId: BRANCH_ID })

    const res = await PUT(putRequest(), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(assertBranchActiveMock).toHaveBeenCalledWith(expect.anything(), BRANCH_ID)
    expect(client.query).toHaveBeenCalledWith("COMMIT")
  })

  it("uses aliased scope SQL so institution join does not fail", async () => {
    const client = setupPutHappyPath()

    await PUT(putRequest(), routeParams())

    const joinedSelect = client.query.mock.calls.find(([sql]) =>
      normalizeSql(String(sql)).includes("from loan_products lp") &&
      normalizeSql(String(sql)).includes("join institutions i"),
    )
    expect(joinedSelect?.[0]).toContain("lp.id = $1")
    expect(joinedSelect?.[0]).toContain("lp.institution_id = $2")
    expect(joinedSelect?.[0]).not.toMatch(/\bwhere id =/)
  })
})
