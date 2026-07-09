import { enqueueMemberEmail } from "./enqueue-member-email"

export const LOAN_PAYMENT_EMAIL_TEMPLATES = {
  paymentReceived: "loan.payment_received",
} as const

export interface LoanPaymentEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface LoanPaymentEmailTransaction {
  id: string
  transaction_number: string
}

export interface LoanPaymentEmailInput {
  member: LoanPaymentEmailMember
  institutionName: string
  currency?: string
  loan: { id: string; application_id: string }
  payment: { amount: number; balance_after: number; payment_date: string }
  transaction: LoanPaymentEmailTransaction
  context?: { institutionId?: string; branchId?: string; actorId?: string }
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue the loan repayment confirmation email with a receipt PDF attachment.
 * Skipped (without raising) when the member has no email on record.
 */
export async function enqueueLoanPaymentReceivedEmails(
  input: LoanPaymentEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("loan_payment:no_email")
    return result
  }

  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: `Loan Payment Received — ${input.loan.application_id}`,
      template: LOAN_PAYMENT_EMAIL_TEMPLATES.paymentReceived,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        applicationId: input.loan.application_id,
        amount: input.payment.amount,
        balanceAfter: input.payment.balance_after,
        paymentDate: input.payment.payment_date,
        currency: input.currency || "UGX",
        transactionNumber: input.transaction.transaction_number,
      },
      attachmentSpecs: [{ kind: "receipt", transactionId: input.transaction.id }],
      context: input.context,
    },
    "loan_payment",
    result,
  )

  return result
}
