jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import { notifySavingsTransaction } from "@/lib/notifications/transaction-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = () => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  member: { id: "member-1", full_name: "Jane Doe", member_number: "M-001" },
  account: { id: "acc-1", account_number: "SA-001" },
  transaction: {
    id: "txn-1",
    transaction_number: "TXN-1",
    amount: 50000,
    balance_after: 150000,
    type: "Deposit" as const,
    mode: "Cash",
    charges: null,
  },
  currency: "UGX",
})

describe("notifySavingsTransaction", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )
    getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
  })

  it("sends deposit_received and transaction_recorded to the member", async () => {
    const res = await notifySavingsTransaction(baseInput())

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(2)
    expect(memberMessages.map((m: any) => m.type).sort()).toEqual([
      "deposit_received",
      "transaction_recorded",
    ])
    expect(res.memberNotifications).toBe(2)
    expect(res.ok).toBe(true)
  })

  it("sends withdrawal_processed for withdrawals", async () => {
    await notifySavingsTransaction({
      ...baseInput(),
      transaction: { ...baseInput().transaction, type: "Withdrawal" },
    })

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages.map((m: any) => m.type).sort()).toEqual([
      "transaction_recorded",
      "withdrawal_processed",
    ])
  })

  it("notifies transfer destination member with deposit notifications", async () => {
    await notifySavingsTransaction({
      ...baseInput(),
      transaction: { ...baseInput().transaction, type: "Transfer" },
      destination: {
        member: { id: "member-2", full_name: "John Doe", member_number: "M-002" },
        account: { id: "acc-2", account_number: "SA-002" },
        transaction: {
          id: "txn-2",
          transaction_number: "TXN-2",
          amount: 50000,
          balance_after: 80000,
        },
      },
    })

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(4)
    const destMessages = memberMessages.filter((m: any) => m.recipientId === "member-2")
    expect(destMessages.map((m: any) => m.type).sort()).toEqual([
      "deposit_received",
      "transaction_recorded",
    ])
  })

  it("notifies transfer destination even when same member as source", async () => {
    await notifySavingsTransaction({
      ...baseInput(),
      transaction: { ...baseInput().transaction, type: "Transfer" },
      destination: {
        member: { id: "member-1", full_name: "Jane Doe", member_number: "M-001" },
        account: { id: "acc-2", account_number: "SA-002" },
        transaction: {
          id: "txn-2",
          transaction_number: "TXN-2",
          amount: 50000,
          balance_after: 80000,
        },
      },
    })

    const memberMessages = createBulk.mock.calls[0][0]
    expect(memberMessages).toHaveLength(4)
    expect(memberMessages.filter((m: any) => m.type === "deposit_received")).toHaveLength(1)
  })
})
