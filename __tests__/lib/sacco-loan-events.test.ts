jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import { notifySaccoLoanCreated, notifySaccoLoanActivated, notifySaccoLoanPaymentRecorded } from "@/lib/notifications/sacco-loan-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = () => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  agent: { id: "agent-1", name: "Acme Finance" },
  loan: {
    id: "loan-1",
    principal_amount: 5_000_000,
    loan_product: "Working Capital",
    loan_type: "normal",
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  createBulk.mockImplementation((messages: unknown[]) =>
    Promise.resolve({ ok: true, count: messages.length }),
  )
  getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
})

describe("notifySaccoLoanCreated", () => {
  it("fans out to view_sacco_loans holders excluding the actor", async () => {
    const res = await notifySaccoLoanCreated(baseInput())

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_sacco_loans")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("sacco_loan_created")
    expect(staffBatch[0].recipientType).toBe("institution_user")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].metadata).toEqual({
      sacco_loan_id: "loan-1",
      third_party_agent_id: "agent-1",
      third_party_agent_name: "Acme Finance",
      amount: 5_000_000,
      loan_type: "normal",
      product_name: "Working Capital",
      status: "Applied",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no recipients are found", async () => {
    getRecipients.mockResolvedValue([])

    const res = await notifySaccoLoanCreated(baseInput())

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no client is provided", async () => {
    const res = await notifySaccoLoanCreated({
      ...baseInput(),
      client: undefined,
    })

    expect(getRecipients).not.toHaveBeenCalled()
    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})

describe("notifySaccoLoanActivated", () => {
  const activateInput = () => ({
    client: {} as any,
    actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
    agent: { id: "agent-1", name: "Acme Finance" },
    loan: {
      id: "loan-1",
      loan_product: "Working Capital",
      next_payment_date: "2026-07-01",
      maturity_date: "2027-07-01",
      monthly_payment: 500_000,
    },
  })

  it("fans out to view_sacco_loans holders excluding the actor", async () => {
    const res = await notifySaccoLoanActivated(activateInput())

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_sacco_loans")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("sacco_loan_activated")
    expect(staffBatch[0].metadata).toEqual({
      sacco_loan_id: "loan-1",
      third_party_agent_id: "agent-1",
      third_party_agent_name: "Acme Finance",
      product_name: "Working Capital",
      status: "Active",
      next_payment_date: "2026-07-01",
      maturity_date: "2027-07-01",
      monthly_payment: 500_000,
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })
})

describe("notifySaccoLoanPaymentRecorded", () => {
  const paymentInput = () => ({
    client: {} as any,
    actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
    agent: { id: "agent-1", name: "Acme Finance" },
    loan: { id: "loan-1", loan_product: "Working Capital" },
    payment: {
      amount: 500_000,
      balance_after: 4_500_000,
      payment_date: "2026-06-17",
      status: "Active",
    },
    transaction: { id: "tx-1", transaction_number: "SLR-0001" },
  })

  it("fans out to view_sacco_loans holders excluding the actor", async () => {
    const res = await notifySaccoLoanPaymentRecorded(paymentInput())

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_sacco_loans")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("sacco_loan_payment_recorded")
    expect(staffBatch[0].metadata).toEqual({
      sacco_loan_id: "loan-1",
      third_party_agent_id: "agent-1",
      third_party_agent_name: "Acme Finance",
      product_name: "Working Capital",
      amount: 500_000,
      balance_after: 4_500_000,
      payment_date: "2026-06-17",
      status: "Active",
      transaction_id: "tx-1",
      transaction_number: "SLR-0001",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("uses closed-loan messaging when the loan is fully paid", async () => {
    await notifySaccoLoanPaymentRecorded({
      ...paymentInput(),
      payment: {
        amount: 4_500_000,
        balance_after: 0,
        payment_date: "2026-06-17",
        status: "Closed",
      },
    })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch[0].message).toContain("loan is now closed")
    expect(staffBatch[0].metadata?.status).toBe("Closed")
  })
})
