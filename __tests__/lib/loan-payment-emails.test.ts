import { enqueueLoanPaymentReceivedEmails } from "@/lib/email/loan-payment-emails"

jest.mock("@/lib/email/enqueue-member-email", () => ({
  enqueueMemberEmail: jest.fn().mockResolvedValue(undefined),
}))

import { enqueueMemberEmail } from "@/lib/email/enqueue-member-email"

const enqueueMemberEmailMock = enqueueMemberEmail as jest.Mock

describe("enqueueLoanPaymentReceivedEmails", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enqueueMemberEmailMock.mockImplementation(async (_memberId, _job, label, out) => {
      out.enqueued.push(label)
    })
  })

  it("enqueues email with receipt attachment spec", async () => {
    const result = await enqueueLoanPaymentReceivedEmails({
      member: {
        id: "member-1",
        full_name: "Jane Doe",
        member_number: "M-001",
        email: "jane@example.com",
      },
      institutionName: "Test SACCO",
      currency: "UGX",
      loan: { id: "loan-1", application_id: "LN-001" },
      payment: { amount: 50000, balance_after: 950000, payment_date: "2026-06-17" },
      transaction: { id: "tx-1", transaction_number: "TXN-001" },
      context: { institutionId: "inst-1", branchId: "branch-1", actorId: "staff-1" },
    })

    expect(result.enqueued).toContain("loan_payment")
    expect(enqueueMemberEmailMock).toHaveBeenCalledWith(
      "member-1",
      expect.objectContaining({
        template: "loan.payment_received",
        attachmentSpecs: [{ kind: "receipt", transactionId: "tx-1" }],
      }),
      "loan_payment",
      expect.any(Object),
    )
  })

  it("skips when member has no email", async () => {
    const result = await enqueueLoanPaymentReceivedEmails({
      member: {
        id: "member-1",
        full_name: "Jane Doe",
        member_number: "M-001",
        email: "",
      },
      institutionName: "Test SACCO",
      loan: { id: "loan-1", application_id: "LN-001" },
      payment: { amount: 50000, balance_after: 950000, payment_date: "2026-06-17" },
      transaction: { id: "tx-1", transaction_number: "TXN-001" },
    })

    expect(result.skipped).toContain("loan_payment:no_email")
    expect(enqueueMemberEmailMock).not.toHaveBeenCalled()
  })
})
