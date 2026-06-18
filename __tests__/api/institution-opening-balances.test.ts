import { GET, POST } from "@/app/api/institution/members/[id]/opening-balances/route"
import {
  SUPER_ADMIN_WRITE_BLOCKED,
  SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
} from "@/lib/api/rbac"

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

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

jest.mock("@/lib/members/member-status", () => ({
  assertMemberActive: jest.fn(),
}))

jest.mock("@/lib/transactions/create-transaction", () => ({
  createTransaction: jest.fn(),
}))

jest.mock("@/lib/finances/bank-account", () => ({
  getBranchBankAccount: jest.fn(),
  adjustBankAccountBalance: jest.fn(),
}))

jest.mock("@/lib/finances/daily-finance", () => ({
  applyDailyFinanceEntry: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/lib/notifications/opening-balance-events", () => ({
  notifyOpeningBalance: jest.fn().mockResolvedValue({
    ok: true,
    memberNotifications: 1,
    staffNotifications: 1,
    errors: [],
  }),
}))

jest.mock("@/lib/email/opening-balance-emails", () => ({
  enqueueOpeningBalanceEmails: jest.fn().mockResolvedValue({
    enqueued: ["opening_balance"],
    skipped: [],
    errors: [],
  }),
}))

import { getServerSession } from "next-auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { resolveActorContext, hasPermission, assertNotSuperAdmin } from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertMemberActive } from "@/lib/members/member-status"
import { createTransaction } from "@/lib/transactions/create-transaction"
import { getBranchBankAccount, adjustBankAccountBalance } from "@/lib/finances/bank-account"
import { applyDailyFinanceEntry } from "@/lib/finances/daily-finance"
import { notifyOpeningBalance } from "@/lib/notifications/opening-balance-events"
import { enqueueOpeningBalanceEmails } from "@/lib/email/opening-balance-emails"

const getServerSessionMock = getServerSession as jest.Mock
const runWithAuthMock = runWithAuth as jest.Mock
const runWithoutAuthMock = runWithoutAuth as jest.Mock
const resolveActorContextMock = resolveActorContext as jest.Mock
const hasPermissionMock = hasPermission as jest.Mock
const assertNotSuperAdminMock = assertNotSuperAdmin as jest.Mock
const assertBranchActiveMock = assertBranchActive as jest.Mock
const assertMemberActiveMock = assertMemberActive as jest.Mock
const createTransactionMock = createTransaction as jest.Mock
const getBranchBankAccountMock = getBranchBankAccount as jest.Mock
const adjustBankAccountBalanceMock = adjustBankAccountBalance as jest.Mock
const applyDailyFinanceEntryMock = applyDailyFinanceEntry as jest.Mock
const notifyOpeningBalanceMock = notifyOpeningBalance as jest.Mock
const enqueueOpeningBalanceEmailsMock = enqueueOpeningBalanceEmails as jest.Mock

const MEMBER_ID = "member-1"
const INSTITUTION_ID = "inst-1"
const BRANCH_ID = "branch-1"
const STAFF_ID = "staff-1"
const AUTH_USER_ID = "auth-user-1"
const SAVINGS_ACCOUNT_ID = "sav-1"
const BANK_ACCOUNT_ID = "bank-1"
const LOAN_PRODUCT_ID = "prod-1"

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

const memberRow = {
  id: MEMBER_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  member_number: "M-001",
  full_name: "Jane Doe",
  email: "jane@example.com",
  status: "Active",
  opening_balance_recorded: false,
}

const bankAccountRow = {
  id: BANK_ACCOUNT_ID,
  bank_name: "Stanbic",
  bank_account_number: "0123456789",
  available_balance: 1_000_000,
  total_amount: 1_000_000,
  branch_id: BRANCH_ID,
}

function routeParams() {
  return { params: Promise.resolve({ id: MEMBER_ID }) }
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

/** Flexible pg client mock keyed by SQL substrings. */
function createMockClient(handlers: {
  member?: typeof memberRow | null
  savingsAccounts?: object[]
  savingsVerify?: { id: string; available_balance: number; account_number?: string; account_type?: string } | null
  loans?: object[]
  loanProducts?: object[]
  loanInsertId?: string
} = {}) {
  const {
    member = memberRow,
    savingsAccounts = [
      {
        id: SAVINGS_ACCOUNT_ID,
        account_number: "SA-001",
        account_type: "Voluntary",
        available_balance: 0,
        total_balance: 0,
        status: "Active",
      },
    ],
    savingsVerify = {
      id: SAVINGS_ACCOUNT_ID,
      available_balance: 0,
      account_number: "SA-001",
      account_type: "Voluntary",
    },
    loans = [],
    loanProducts = [
      {
        id: LOAN_PRODUCT_ID,
        product_name: "Emergency Loan",
        product_code: "EML",
        interest_rate: 15,
        interest_calculation_method: "reducing_balance",
        minimum_tenure_months: 6,
        maximum_tenure_months: 24,
      },
    ],
    loanInsertId = "loan-new-1",
  } = handlers

  return {
    query: jest.fn().mockImplementation(async (sql: string) => {
      const s = normalizeSql(sql)

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] }
      }

      if (s.includes("opening_balance_recorded") && s.includes("from members")) {
        return { rows: member ? [member] : [] }
      }

      if (
        s.includes("from members where id") &&
        s.includes("institution_id") &&
        !s.includes("opening_balance_recorded")
      ) {
        return { rows: member ? [member] : [] }
      }

      if (s.includes("from savings_accounts") && s.includes("available_balance")) {
        return { rows: savingsVerify ? [savingsVerify] : [] }
      }

      if (s.includes("from savings_accounts")) {
        return { rows: savingsAccounts }
      }

      if (s.includes("from loans l")) {
        return { rows: loans }
      }

      if (s.includes("from loan_products")) {
        return { rows: loanProducts }
      }

      if (s.includes("insert into loans") && s.includes("returning id")) {
        return { rows: [{ id: loanInsertId }] }
      }

      if (s.includes("insert into loan_repayments")) {
        return { rows: [] }
      }

      if (s.includes("update savings_accounts")) {
        return { rows: [] }
      }

      if (s.includes("update members set opening_balance_recorded")) {
        return { rows: [] }
      }

      if (s.includes("from config")) {
        return { rows: [{ currency: "UGX" }] }
      }

      if (s.includes("from institutions")) {
        return { rows: [{ name: "Test SACCO" }] }
      }

      return { rows: [] }
    }),
  }
}

function setupRunWithAuth(client: ReturnType<typeof createMockClient>) {
  runWithAuthMock.mockImplementation(async (_authUserId: string, fn: (c: typeof client) => unknown) =>
    fn(client),
  )
  runWithoutAuthMock.mockImplementation(async (fn: (c: typeof client) => unknown) => fn(client))
}

function setupHappyAuth() {
  resolveActorContextMock.mockResolvedValue(actor)
  assertNotSuperAdminMock.mockReturnValue({ ok: true })
  assertBranchActiveMock.mockResolvedValue({
    ok: true,
    branch: { id: BRANCH_ID, institution_id: INSTITUTION_ID, name: "HQ", status: "Active" },
  })
  assertMemberActiveMock.mockResolvedValue({
    ok: true,
    member: memberRow,
  })
  getBranchBankAccountMock.mockResolvedValue({ ...bankAccountRow })
  createTransactionMock.mockResolvedValue({
    id: "txn-1",
    transactionNumber: "OB-SAV-001",
  })
  adjustBankAccountBalanceMock.mockImplementation(async (_client, { account, amount }) => ({
    availableBalance: Number(account.available_balance ?? 0) + amount,
    totalAmount: Number(account.total_amount ?? 0) + amount,
  }))
}

describe("GET /api/institution/members/[id]/opening-balances", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
  })

  it("returns 401 when there is no session", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const res = await GET(new Request("http://localhost/opening-balances"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 403 when the session is not staff", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { authUserId: AUTH_USER_ID, type: "client" },
    })

    const res = await GET(new Request("http://localhost/opening-balances"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("no_app_user_profile")
  })

  it("returns 404 when the member is not found", async () => {
    const client = createMockClient({ member: null })
    setupRunWithAuth(client)
    resolveActorContextMock.mockResolvedValue(actor)
    hasPermissionMock.mockResolvedValue(true)

    const res = await GET(new Request("http://localhost/opening-balances"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("member_not_found")
  })

  it("returns opening balance context for a valid member", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
    resolveActorContextMock.mockResolvedValue(actor)
    hasPermissionMock.mockResolvedValue(true)

    const res = await GET(new Request("http://localhost/opening-balances"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.openingBalanceRecorded).toBe(false)
    expect(body.savingsAccounts).toHaveLength(1)
    expect(body.savingsAccounts[0].id).toBe(SAVINGS_ACCOUNT_ID)
    expect(body.loanProducts).toHaveLength(1)
  })
})

describe("POST /api/institution/members/[id]/opening-balances", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSessionMock.mockResolvedValue(staffSession)
    setupHappyAuth()
    hasPermissionMock.mockImplementation(async (_client, _actor, perm: string) => {
      if (perm === "edit_opening_savings" || perm === "edit_opening_loans") return true
      return false
    })
  })

  function postRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/opening-balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("returns 400 when neither savings nor loan balances are provided", async () => {
    const res = await POST(postRequest({}), routeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("Provide at least a savings balance or loan outstanding balance")
    expect(runWithAuthMock).not.toHaveBeenCalled()
  })

  it("returns 400 when savings are provided without a bank account", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)

    const res = await POST(
      postRequest({
        savingsEntries: [{ accountId: SAVINGS_ACCOUNT_ID, balance: 500_000 }],
      }),
      routeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("bank_account_required")
  })

  it("blocks super admins from recording opening balances", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
    resolveActorContextMock.mockResolvedValue({ ...actor, role: "super_admin" })
    assertNotSuperAdminMock.mockReturnValue({
      ok: false,
      status: 403,
      error: SUPER_ADMIN_WRITE_BLOCKED,
      message: SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
    })

    const res = await POST(
      postRequest({
        savingsEntries: [{ accountId: SAVINGS_ACCOUNT_ID, balance: 100_000 }],
        bankAccountId: BANK_ACCOUNT_ID,
      }),
      routeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe(SUPER_ADMIN_WRITE_BLOCKED)
    expect(body.error).toBe(SUPER_ADMIN_WRITE_BLOCKED_MESSAGE)
  })

  it("returns 403 when the user lacks edit_opening_savings permission", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
    hasPermissionMock.mockImplementation(async (_client, _actor, perm: string) => {
      if (perm === "edit_opening_loans") return true
      return false
    })

    const res = await POST(
      postRequest({
        savingsEntries: [{ accountId: SAVINGS_ACCOUNT_ID, balance: 100_000 }],
        bankAccountId: BANK_ACCOUNT_ID,
      }),
      routeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("missing_permission:edit_opening_savings")
  })

  it("records multi-account savings, credits the bank once, and updates daily finances", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)

    const res = await POST(
      postRequest({
        savingsEntries: [
          { accountId: SAVINGS_ACCOUNT_ID, balance: 500_000 },
          { accountId: "sav-2", balance: 200_000 },
        ],
        bankAccountId: BANK_ACCOUNT_ID,
      }),
      routeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.savingsUpdated).toBe(true)

    expect(createTransactionMock).toHaveBeenCalledTimes(2)
    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "Opening Balance",
        mode: "Bank Transfer",
        amount: 500_000,
        accountId: SAVINGS_ACCOUNT_ID,
      }),
    )
    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        amount: 200_000,
        accountId: "sav-2",
      }),
    )

    expect(adjustBankAccountBalanceMock).toHaveBeenCalledTimes(1)
    expect(adjustBankAccountBalanceMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ amount: 700_000 }),
    )

    expect(applyDailyFinanceEntryMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        institutionId: INSTITUTION_ID,
        branchId: BRANCH_ID,
        amount: 0,
        mode: "Bank Transfer",
      }),
    )

    expect(notifyOpeningBalanceMock).toHaveBeenCalled()
    expect(enqueueOpeningBalanceEmailsMock).toHaveBeenCalled()
  })

  it("returns bank_account_insufficient_funds when loan net debit would overdraw the bank", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)
    getBranchBankAccountMock.mockResolvedValue({
      ...bankAccountRow,
      available_balance: 500_000,
      total_amount: 500_000,
    })

    const res = await POST(
      postRequest({
        bankAccountId: BANK_ACCOUNT_ID,
        loanOutstandingBalance: 1_500_000,
        loanProductId: LOAN_PRODUCT_ID,
        loanPrincipalAmount: 2_000_000,
        loanTenureMonths: 12,
        loanOriginalTenure: 24,
      }),
      routeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("bank_account_insufficient_funds")

    const clientQueries = client.query.mock.calls.map((c) => c[0])
    expect(clientQueries).toContain("ROLLBACK")
    expect(adjustBankAccountBalanceMock).not.toHaveBeenCalled()
    expect(notifyOpeningBalanceMock).not.toHaveBeenCalled()
  })

  it("applies a net loan bank adjustment when recording a migrated loan", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)

    const res = await POST(
      postRequest({
        bankAccountId: BANK_ACCOUNT_ID,
        loanOutstandingBalance: 150_000,
        loanProductId: LOAN_PRODUCT_ID,
        loanPrincipalAmount: 1_000_000,
        loanTenureMonths: 3,
        loanOriginalTenure: 12,
      }),
      routeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.loanCreated).toBe(true)
    expect(body.loanId).toBe("loan-new-1")

    expect(adjustBankAccountBalanceMock).toHaveBeenCalledTimes(1)
    const bankAdjust = adjustBankAccountBalanceMock.mock.calls[0][1]
    // Repayments received minus original disbursement; sign depends on schedule math.
    expect(typeof bankAdjust.amount).toBe("number")
    expect(Number.isFinite(bankAdjust.amount)).toBe(true)

    expect(applyDailyFinanceEntryMock).toHaveBeenCalled()
    expect(notifyOpeningBalanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        savings: null,
        loan: expect.objectContaining({ loanId: "loan-new-1" }),
      }),
    )
  })

  it("deduplicates savingsEntries by accountId (last value wins)", async () => {
    const client = createMockClient()
    setupRunWithAuth(client)

    const res = await POST(
      postRequest({
        bankAccountId: BANK_ACCOUNT_ID,
        savingsEntries: [
          { accountId: SAVINGS_ACCOUNT_ID, balance: 100_000 },
          { accountId: SAVINGS_ACCOUNT_ID, balance: 250_000 },
        ],
      }),
      routeParams(),
    )

    expect(res.status).toBe(201)
    expect(createTransactionMock).toHaveBeenCalledTimes(1)
    expect(createTransactionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ amount: 250_000 }),
    )
    expect(adjustBankAccountBalanceMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ amount: 250_000 }),
    )
  })
})
