import { enqueueMemberEmail } from "./enqueue-member-email"

export const FEE_EMAIL_TEMPLATES = {
  membershipFeePaid: "membership_fee.paid",
} as const

export interface FeeEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface FeeEmailInvoice {
  id: string
  invoice_number: string
  fullySettled: boolean
}

export interface FeeEmailTransaction {
  id: string
  transaction_number: string
}

export interface MembershipFeeEmailInput {
  member: FeeEmailMember
  institutionName: string
  currency?: string
  fee: { amount: number; remaining: number }
  transaction: FeeEmailTransaction
  invoice?: FeeEmailInvoice | null
  context?: { institutionId?: string; branchId?: string; actorId?: string }
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue the membership-fee confirmation email with a receipt PDF attachment.
 * Skipped (without raising) when the member has no email on record.
 */
export async function enqueueMembershipFeeEmails(
  input: MembershipFeeEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("membership_fee:no_email")
    return result
  }

  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: input.invoice
        ? `Membership Fee Payment Received — Invoice ${input.invoice.invoice_number}`
        : "Membership Fee Payment Received",
      template: FEE_EMAIL_TEMPLATES.membershipFeePaid,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        amount: input.fee.amount,
        remaining: input.fee.remaining,
        currency: input.currency || "UGX",
        invoiceNumber: input.invoice?.invoice_number || null,
        invoiceFullySettled: input.invoice?.fullySettled ?? null,
        transactionNumber: input.transaction.transaction_number,
      },
      attachmentSpecs: [{ kind: "receipt", transactionId: input.transaction.id }],
      context: input.context,
    },
    "membership_fee",
    result,
  )

  return result
}
