jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import {
  notifyInvestmentCashflowRecorded,
  notifyInvestmentCreated,
  notifyInvestmentDevelopmentStarted,
} from "@/lib/notifications/investment-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseActor = () => ({
  id: "staff-1",
  institution_id: "inst-1",
  branch_id: "branch-1",
})

beforeEach(() => {
  jest.clearAllMocks()
  createBulk.mockImplementation((messages: unknown[]) =>
    Promise.resolve({ ok: true, count: messages.length }),
  )
  getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
})

describe("notifyInvestmentCreated", () => {
  it("fans out to view_investments holders excluding the actor", async () => {
    const res = await notifyInvestmentCreated({
      client: {} as any,
      actor: baseActor(),
      investment: {
        id: "inv-1",
        investment_name: "Greenfield Estate",
        investment_number: "INV-20260101-ABCD",
        initial_amount: 25_000_000,
        category: "real_estate",
        provider_id: "agent-1",
        provider_name: "Acme Capital",
        status: "pending",
      },
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_investments")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("investment_created")
    expect(staffBatch[0].recipientType).toBe("institution_user")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].actionUrl).toBe("/investments/inv-1")
    expect(staffBatch[0].metadata).toEqual({
      investment_id: "inv-1",
      investment_number: "INV-20260101-ABCD",
      investment_name: "Greenfield Estate",
      amount: 25_000_000,
      category: "real_estate",
      provider_id: "agent-1",
      provider_name: "Acme Capital",
      status: "pending",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no recipients are found", async () => {
    getRecipients.mockResolvedValue([])

    const res = await notifyInvestmentCreated({
      client: {} as any,
      actor: baseActor(),
      investment: { id: "inv-1", initial_amount: 1_000 },
    })

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no client is provided", async () => {
    const res = await notifyInvestmentCreated({
      client: undefined,
      actor: baseActor(),
      investment: { id: "inv-1", initial_amount: 1_000 },
    })

    expect(getRecipients).not.toHaveBeenCalled()
    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})

describe("notifyInvestmentDevelopmentStarted", () => {
  it("fans out to view_investments holders excluding the actor", async () => {
    const res = await notifyInvestmentDevelopmentStarted({
      client: {} as any,
      actor: baseActor(),
      investment: {
        id: "inv-1",
        investment_name: "Greenfield Estate",
        investment_number: "INV-20260101-ABCD",
        principal_amount: 25_000_000,
        start_date: "2026-01-15",
        maturity_date: "2028-01-15",
      },
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_investments")

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("investment_development_started")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].actionUrl).toBe("/investments/inv-1")
    expect(staffBatch[0].metadata).toEqual({
      investment_id: "inv-1",
      investment_number: "INV-20260101-ABCD",
      investment_name: "Greenfield Estate",
      amount: 25_000_000,
      start_date: "2026-01-15",
      maturity_date: "2028-01-15",
      status: "under_development",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })
})

describe("notifyInvestmentCashflowRecorded", () => {
  it("fans out to view_investments holders excluding the actor", async () => {
    const res = await notifyInvestmentCashflowRecorded({
      client: {} as any,
      actor: baseActor(),
      investment: {
        id: "inv-1",
        investment_name: "Greenfield Estate",
        investment_number: "INV-20260101-ABCD",
      },
      cashflow: {
        id: "cf-1",
        type: "inflow",
        category: "capital",
        amount: 5_000_000,
        date: "2026-06-15",
      },
      valuation: {
        opening_value: 20_000_000,
        closing_value: 25_000_000,
      },
      transactionId: "tx-1",
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_investments")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("investment_cashflow_recorded")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].actionUrl).toBe("/investments/inv-1")
    expect(staffBatch[0].metadata).toEqual({
      investment_id: "inv-1",
      investment_number: "INV-20260101-ABCD",
      investment_name: "Greenfield Estate",
      cashflow_id: "cf-1",
      type: "inflow",
      category: "capital",
      amount: 5_000_000,
      date: "2026-06-15",
      opening_value: 20_000_000,
      closing_value: 25_000_000,
      transaction_id: "tx-1",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("uses adjustment-specific messaging for value adjustments", async () => {
    await notifyInvestmentCashflowRecorded({
      client: {} as any,
      actor: baseActor(),
      investment: {
        id: "inv-1",
        investment_name: "Greenfield Estate",
        investment_number: "INV-20260101-ABCD",
      },
      cashflow: {
        id: "cf-2",
        type: "inflow",
        category: "adjustment",
        amount: 2_000_000,
        date: "2026-06-20",
      },
      valuation: {
        opening_value: 25_000_000,
        closing_value: 27_000_000,
      },
    })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch[0].title).toBe("Investment Value Adjusted")
    expect(staffBatch[0].metadata?.category).toBe("adjustment")
    expect(staffBatch[0].metadata?.transaction_id).toBeUndefined()
  })
})
