jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import {
  notifyExpenseCashflowPaymentRecorded,
  notifyExpenseCreated,
  notifyExpenseUpdated,
} from "@/lib/notifications/expense-events"
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

describe("notifyExpenseCreated", () => {
  it("fans out to view_expenses holders excluding the actor", async () => {
    const res = await notifyExpenseCreated({
      client: {} as any,
      actor: baseActor(),
      expense: {
        id: "exp-1",
        name: "Office Supplies",
        expense_number: "EXP-20260101-ABCD",
        type: "Operating-expenses",
        status: "Pending",
      },
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_expenses")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("expense_created")
    expect(staffBatch[0].recipientType).toBe("institution_user")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].actionUrl).toBe("/expenses/exp-1")
    expect(staffBatch[0].metadata).toEqual({
      expense_id: "exp-1",
      expense_number: "EXP-20260101-ABCD",
      expense_name: "Office Supplies",
      type: "Operating-expenses",
      status: "Pending",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no recipients are found", async () => {
    getRecipients.mockResolvedValue([])

    const res = await notifyExpenseCreated({
      client: {} as any,
      actor: baseActor(),
      expense: { id: "exp-1", name: "Office Supplies" },
    })

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no client is provided", async () => {
    const res = await notifyExpenseCreated({
      client: undefined,
      actor: baseActor(),
      expense: { id: "exp-1", name: "Office Supplies" },
    })

    expect(getRecipients).not.toHaveBeenCalled()
    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})

describe("notifyExpenseUpdated", () => {
  it("fans out to view_expenses holders excluding the actor", async () => {
    const res = await notifyExpenseUpdated({
      client: {} as any,
      actor: baseActor(),
      expense: {
        id: "exp-1",
        name: "Office Supplies",
        expense_number: "EXP-20260101-ABCD",
        type: "Operating-expenses",
        status: "Pending",
      },
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_expenses")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("expense_updated")
    expect(staffBatch[0].recipientType).toBe("institution_user")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].actionUrl).toBe("/expenses/exp-1")
    expect(staffBatch[0].metadata).toEqual({
      expense_id: "exp-1",
      expense_number: "EXP-20260101-ABCD",
      expense_name: "Office Supplies",
      type: "Operating-expenses",
      status: "Pending",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no recipients are found", async () => {
    getRecipients.mockResolvedValue([])

    const res = await notifyExpenseUpdated({
      client: {} as any,
      actor: baseActor(),
      expense: { id: "exp-1", name: "Office Supplies" },
    })

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})

describe("notifyExpenseCashflowPaymentRecorded", () => {
  it("fans out to view_expenses holders excluding the actor", async () => {
    const res = await notifyExpenseCashflowPaymentRecorded({
      client: {} as any,
      actor: baseActor(),
      expense: {
        id: "exp-1",
        name: "Office Supplies",
        expense_number: "EXP-20260101-ABCD",
      },
      cashflow: {
        id: "cf-1",
        amount: 1000000,
        status: "Part Paid",
        outstanding: 500000,
      },
      assigneeName: "Jane Staff",
      transaction: {
        id: "tx-1",
        transaction_number: "TXN-001",
        amount: 500000,
      },
      currency: "UGX",
    })

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_expenses")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("expense_cashflow_payment_recorded")
    expect(staffBatch[0].recipientType).toBe("institution_user")
    expect(staffBatch[0].actionUrl).toBe("/expenses/exp-1")
    expect(staffBatch[0].metadata).toMatchObject({
      expense_id: "exp-1",
      expense_cashflow_id: "cf-1",
      transaction_id: "tx-1",
      transaction_number: "TXN-001",
      amount: 500000,
      outstanding: 500000,
      fully_paid: false,
      assignee_name: "Jane Staff",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("marks fully paid when outstanding is zero", async () => {
    await notifyExpenseCashflowPaymentRecorded({
      client: {} as any,
      actor: baseActor(),
      expense: { id: "exp-1", name: "Office Supplies" },
      cashflow: {
        id: "cf-1",
        amount: 1000000,
        status: "Fully Paid",
        outstanding: 0,
      },
      assigneeName: "Jane Staff",
      transaction: {
        id: "tx-1",
        transaction_number: "TXN-001",
        amount: 1000000,
      },
    })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch[0].title).toBe("Expense Cashflow Fully Paid")
    expect(staffBatch[0].metadata?.fully_paid).toBe(true)
  })
})
