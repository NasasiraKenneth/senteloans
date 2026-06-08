jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import { notifySharePurchase } from "@/lib/notifications/share-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = () => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  member: { id: "member-1", full_name: "Jane Doe", member_number: "M-001" },
  shares: { numberOfShares: 10, totalValue: 100000 },
  transaction: { id: "txn-1", transaction_number: "TXN-1", amount: 100000 },
  invoice: { id: "inv-1", invoice_number: "INV-1", total_amount: 100000 },
  currency: "KES",
})

describe("notifySharePurchase", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )
    // One eligible staff recipient for every permission lookup.
    getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
  })

  it("sends the member all three notifications (shares, transaction, invoice)", async () => {
    const res = await notifySharePurchase(baseInput())

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(3)
    expect(memberMessages.map((m: any) => m.type).sort()).toEqual([
      "invoice_created",
      "shares_purchased",
      "transaction_recorded",
    ])
    expect(memberMessages.every((m: any) => m.recipientType === "member")).toBe(true)
    expect(res.memberNotifications).toBe(3)
  })

  it("fans out to staff once per module permission", async () => {
    const res = await notifySharePurchase(baseInput())

    const perms = getRecipients.mock.calls.map((c) => c[2])
    expect(perms).toEqual(["view_members", "view_transactions", "view_invoices"])
    // The acting staff member is always excluded.
    for (const call of getRecipients.mock.calls) {
      expect(call[3]).toEqual({ excludeUserId: "staff-1" })
    }

    // 1 member batch + 3 staff batches.
    expect(createBulk).toHaveBeenCalledTimes(4)
    expect(res.staffNotifications).toBe(3)
    expect(res.ok).toBe(true)
  })

  it("omits the invoice notifications when there is no invoice", async () => {
    const input = { ...baseInput(), invoice: null }
    const res = await notifySharePurchase(input)

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(2)
    expect(memberMessages.map((m: any) => m.type).sort()).toEqual([
      "shares_purchased",
      "transaction_recorded",
    ])

    const perms = getRecipients.mock.calls.map((c) => c[2])
    expect(perms).toEqual(["view_members", "view_transactions"])
    expect(res.memberNotifications).toBe(2)
  })

  it("collects errors without throwing when a staff lookup fails", async () => {
    getRecipients.mockRejectedValueOnce(new Error("db_down"))
    const res = await notifySharePurchase(baseInput())
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes("view_members"))).toBe(true)
  })
})
