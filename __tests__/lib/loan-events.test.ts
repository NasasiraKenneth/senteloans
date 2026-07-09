jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { create: jest.fn(), createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import { notifyLoanApplicationCreated, notifyLoanStatusChanged } from "@/lib/notifications/loan-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const create = notificationService.create as jest.Mock
const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = () => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  member: { id: "member-1", full_name: "Jane Doe" },
  loan: {
    id: "loan-1",
    application_id: "LN-1001",
    principal_amount: 500000,
    loan_type: "normal",
    product_name: "Salary Loan",
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  create.mockResolvedValue({ ok: true })
  createBulk.mockImplementation((messages: unknown[]) =>
    Promise.resolve({ ok: true, count: messages.length }),
  )
  getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
})

describe("notifyLoanApplicationCreated", () => {
  it("notifies the member and fans out staff alerts to view_loans holders", async () => {
    const res = await notifyLoanApplicationCreated(baseInput())

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toMatchObject({
      recipientType: "member",
      recipientId: "member-1",
      type: "loan_application_submitted",
      message: expect.stringContaining("LN-1001"),
      metadata: expect.objectContaining({
        application_id: "LN-1001",
        product_name: "Salary Loan",
      }),
    })

    expect(getRecipients).toHaveBeenCalledWith(
      expect.anything(),
      "inst-1",
      "view_loans",
    )

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0]).toMatchObject({
      recipientType: "institution_user",
      recipientId: "staff-2",
      type: "pending_loan_approval",
      message: expect.stringContaining("LN-1001"),
      metadata: expect.objectContaining({
        loan_id: "loan-1",
        application_id: "LN-1001",
        member_id: "member-1",
        product_name: "Salary Loan",
      }),
    })
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("skips staff fan-out when no recipients are found", async () => {
    getRecipients.mockResolvedValue([])

    const res = await notifyLoanApplicationCreated(baseInput())

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.memberNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })
})

const statusInput = (newStatus: string) => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  member: {
    id: "member-1",
    full_name: "Jane Doe",
    member_number: "M-001",
    email: "jane@example.com",
  },
  loan: {
    id: "loan-1",
    application_id: "LN-1001",
    principal_amount: 500000,
    loan_type: "normal",
    product_name: "Salary Loan",
  },
  newStatus,
})

describe("notifyLoanStatusChanged", () => {
  it("notifies member and staff on approval", async () => {
    const res = await notifyLoanStatusChanged(statusInput("Approved"))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toMatchObject({
      recipientType: "member",
      type: "loan_approved",
      message: expect.stringMatching(/Salary Loan application \(LN-1001\)/),
      metadata: expect.objectContaining({
        application_id: "LN-1001",
        product_name: "Salary Loan",
      }),
    })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0]).toMatchObject({
      recipientType: "institution_user",
      recipientId: "staff-2",
      type: "loan_approved",
      message: expect.stringMatching(/Jane Doe's Salary Loan application \(LN-1001\)/),
    })
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("uses loan_under_review for member when status is Under Review", async () => {
    const res = await notifyLoanStatusChanged(statusInput("Under Review"))

    expect(create.mock.calls[0][0]).toMatchObject({
      recipientType: "member",
      type: "loan_under_review",
      title: "Loan Under Review",
      message: expect.stringMatching(/Salary Loan application \(LN-1001\).*under review/),
    })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch[0]).toMatchObject({
      type: "loan_under_review",
      title: "Loan Under Review",
      message: expect.stringMatching(/Jane Doe's Salary Loan application \(LN-1001\)/),
    })
    expect(res.staffNotifications).toBe(1)
  })

  it("fans out staff alerts when status is Reviewed", async () => {
    const res = await notifyLoanStatusChanged(statusInput("Reviewed"))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toMatchObject({
      recipientType: "member",
      type: "loan_reviewed",
    })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0]).toMatchObject({
      recipientType: "institution_user",
      recipientId: "staff-2",
      type: "loan_ready_for_approval",
    })
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("uses loan_partially_disbursed and loan_disbursed for disbursement statuses", async () => {
    await notifyLoanStatusChanged(statusInput("Partially Disbursed"))
    expect(create.mock.calls[0][0]).toMatchObject({
      recipientType: "member",
      type: "loan_partially_disbursed",
    })
    expect(createBulk.mock.calls[0][0][0]).toMatchObject({
      type: "loan_partially_disbursed",
    })

    jest.clearAllMocks()
    create.mockResolvedValue({ ok: true })
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )

    await notifyLoanStatusChanged(statusInput("Fully Disbursed"))
    expect(create.mock.calls[0][0]).toMatchObject({
      recipientType: "member",
      type: "loan_disbursed",
      title: "Loan Fully Disbursed",
    })
    expect(createBulk.mock.calls[0][0][0]).toMatchObject({
      type: "loan_disbursed",
      title: "Loan Fully Disbursed",
    })
  })

  it("includes the actor in staff fan-out when they have view_loans", async () => {
    getRecipients.mockResolvedValue([
      { id: "staff-1", branch_id: "branch-1" },
      { id: "staff-2", branch_id: "branch-1" },
    ])

    const res = await notifyLoanStatusChanged(statusInput("Approved"))

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(2)
    expect(staffBatch.map((m: { recipientId: string }) => m.recipientId)).toEqual(
      expect.arrayContaining(["staff-1", "staff-2"]),
    )
    expect(res.staffNotifications).toBe(2)
  })

  it("skips notifications when status is not in notify set", async () => {
    const res = await notifyLoanStatusChanged(statusInput("Applied"))

    expect(create).not.toHaveBeenCalled()
    expect(createBulk).not.toHaveBeenCalled()
    expect(res.memberNotifications).toBe(0)
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})
