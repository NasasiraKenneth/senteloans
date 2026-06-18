jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import { notifyOpeningBalance } from "@/lib/notifications/opening-balance-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = () => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  member: { id: "member-1", full_name: "Jane Doe", member_number: "M-001" },
  currency: "UGX",
})

describe("notifyOpeningBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )
    getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
  })

  it("sends savings and loan notifications to the member when both are recorded", async () => {
    const res = await notifyOpeningBalance({
      ...baseInput(),
      savings: { amount: 500000, accountId: "sav-1" },
      loan: { outstanding: 1000000, loanId: "loan-1" },
    })

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(2)
    expect(memberMessages.map((m: any) => m.type).sort()).toEqual([
      "opening_loan_recorded",
      "opening_savings_recorded",
    ])
    expect(memberMessages.every((m: any) => m.recipientType === "member")).toBe(true)
    expect(res.memberNotifications).toBe(2)
    expect(res.staffNotifications).toBe(2)
    expect(res.ok).toBe(true)
  })

  it("fans out staff savings notification only to view_savings holders", async () => {
    await notifyOpeningBalance({
      ...baseInput(),
      savings: { amount: 300000, accountId: "sav-1" },
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_savings")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[1][0]
    expect(staffBatch[0].type).toBe("opening_savings_recorded")
    expect(staffBatch[0].recipientType).toBe("institution_user")
  })

  it("fans out staff loan notification only to view_loans holders", async () => {
    await notifyOpeningBalance({
      ...baseInput(),
      loan: { outstanding: 750000, loanId: "loan-1" },
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_loans")

    const staffBatch = createBulk.mock.calls[1][0]
    expect(staffBatch[0].type).toBe("opening_loan_recorded")
  })

  it("skips all notifications when neither savings nor loan is provided", async () => {
    const res = await notifyOpeningBalance(baseInput())

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.memberNotifications).toBe(0)
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})
