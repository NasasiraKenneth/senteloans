jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import {
  notifyInvoiceCreated,
  notifyInvoiceStatusChange,
} from "@/lib/notifications/invoice-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  invoice: {
    id: "inv-1",
    invoice_number: "INV-001",
    total_amount: 50000,
    invoice_due: "2026-07-01",
    status: "draft",
  },
  member: { id: "member-1", full_name: "Jane Doe", member_number: "M-001" },
  currency: "UGX",
  ...overrides,
})

describe("notifyInvoiceCreated", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )
    getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
  })

  it("sends staff-only draft notification for draft member invoices", async () => {
    const res = await notifyInvoiceCreated(baseInput())

    expect(createBulk).toHaveBeenCalledTimes(1)
    const staffMessages = createBulk.mock.calls[0][0]
    expect(staffMessages).toHaveLength(1)
    expect(staffMessages[0].type).toBe("invoice_draft_created")
    expect(staffMessages[0].recipientType).toBe("institution_user")
    expect(res.memberNotifications).toBe(0)
    expect(res.staffNotifications).toBe(1)
    expect(getRecipients).toHaveBeenCalledWith(
      expect.anything(),
      "inst-1",
      "view_invoices",
      { excludeUserId: "staff-1" },
    )
  })

  it("sends staff and member notifications for sent member invoices", async () => {
    const res = await notifyInvoiceCreated(
      baseInput({
        invoice: {
          id: "inv-1",
          invoice_number: "INV-002",
          total_amount: 75000,
          status: "sent",
        },
      }),
    )

    expect(createBulk).toHaveBeenCalledTimes(2)
    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(1)
    expect(memberMessages[0].type).toBe("invoice_created")
    expect(memberMessages[0].recipientType).toBe("member")

    const staffMessages = createBulk.mock.calls[1][0]
    expect(staffMessages[0].type).toBe("invoice_created")
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
  })

  it("sends staff-only notification for sent third-party invoices", async () => {
    const res = await notifyInvoiceCreated(
      baseInput({
        member: null,
        thirdPartyAgent: { id: "agent-1", name: "Acme Ltd" },
        invoice: {
          id: "inv-3",
          invoice_number: "INV-003",
          total_amount: 100000,
          status: "sent",
        },
      }),
    )

    expect(createBulk).toHaveBeenCalledTimes(1)
    const staffMessages = createBulk.mock.calls[0][0]
    expect(staffMessages[0].type).toBe("invoice_created")
    expect(res.memberNotifications).toBe(0)
    expect(res.staffNotifications).toBe(1)
  })

  it("skips notifications for unsupported create statuses", async () => {
    const res = await notifyInvoiceCreated(
      baseInput({
        invoice: {
          id: "inv-4",
          invoice_number: "INV-004",
          total_amount: 20000,
          status: "fully paid",
        },
      }),
    )

    expect(createBulk).not.toHaveBeenCalled()
    expect(getRecipients).not.toHaveBeenCalled()
    expect(res.memberNotifications).toBe(0)
    expect(res.staffNotifications).toBe(0)
  })
})

describe("notifyInvoiceStatusChange", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )
    getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
  })

  const statusInput = (statusTarget: "cancelled" | "overdue") => ({
    client: {} as any,
    actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
    invoice: {
      id: "inv-1",
      invoice_number: "INV-010",
      total_amount: 50000,
      invoice_due: "2026-07-01",
    },
    member: { id: "member-1", full_name: "Jane Doe", member_number: "M-001" },
    statusTarget,
  })

  it("notifies staff and member when invoice is cancelled", async () => {
    const res = await notifyInvoiceStatusChange(statusInput("cancelled"))

    expect(createBulk).toHaveBeenCalledTimes(2)
    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages[0].type).toBe("invoice_cancelled")
    expect(memberMessages[0].message).toContain("INV-010")
    expect(memberMessages[0].message).toContain("cancelled")

    const staffMessages = createBulk.mock.calls[1][0]
    expect(staffMessages[0].type).toBe("invoice_cancelled")
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
  })

  it("notifies staff and member when invoice is overdue", async () => {
    const res = await notifyInvoiceStatusChange(statusInput("overdue"))

    expect(createBulk).toHaveBeenCalledTimes(2)
    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages[0].type).toBe("invoice_overdue")
    expect(memberMessages[0].message).toContain("INV-010")
    expect(memberMessages[0].message).toContain("overdue")
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
  })

  it("notifies staff only for cancelled third-party invoices", async () => {
    const res = await notifyInvoiceStatusChange({
      ...statusInput("cancelled"),
      member: null,
      thirdPartyAgent: { id: "agent-1", name: "Acme Ltd" },
    })

    expect(createBulk).toHaveBeenCalledTimes(1)
    expect(createBulk.mock.calls[0][0][0].recipientType).toBe("institution_user")
    expect(res.memberNotifications).toBe(0)
    expect(res.staffNotifications).toBe(1)
  })
})
