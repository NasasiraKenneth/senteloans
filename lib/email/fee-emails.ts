import { enqueueEmail } from "@/queues/email.queue"

/**
 * Email templates the worker resolves for membership-fee events. Placeholder
 * contract until a real mail provider is wired in (mirrors share-emails).
 */
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

export interface MembershipFeeEmailInput {
  member: FeeEmailMember
  institutionName: string
  currency?: string
  fee: { amount: number; remaining: number }
  invoice?: FeeEmailInvoice | null
  context?: { institutionId?: string; actorId?: string }
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue the membership-fee confirmation email. Skipped (without raising) when
 * the member has no email on record. Fire-and-forget: returns a summary, never
 * throws — a queue outage cannot break the payment HTTP response.
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

  try {
    await enqueueEmail({
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
      },
      context: input.context,
    })
    result.enqueued.push("membership_fee")
  } catch (e) {
    result.errors.push(`membership_fee:${(e as Error)?.message || "enqueue_failed"}`)
  }

  return result
}
