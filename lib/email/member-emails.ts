import type { EmailJobData } from "@/queues/email.queue"
import type { EmailContext } from "./types"
import { enqueueMemberEmail } from "./enqueue-member-email"

export const EMAIL_TEMPLATES = {
  memberWelcome: "member.welcome",
  memberKycRequired: "member.kyc_required",
  memberInvoice: "member.invoice",
} as const

export interface MemberSummary {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface InvoiceEmailSummary {
  id: string
  invoice_number: string
  total_amount: number
  invoice_due?: string | null
}

export interface SavingsAccountEmailSummary {
  account_number: string
  account_type: string
}

export interface MemberRegistrationEmailInput {
  member: MemberSummary
  institutionName: string
  currency?: string
  savingsAccount?: SavingsAccountEmailSummary | null
  invoice?: InvoiceEmailSummary | null
  context?: EmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Workflow: schedule the three emails sent during member onboarding:
 *   1. Welcome
 *   2. KYC verification request
 *   3. Membership-fee invoice (only when an invoice exists)
 *
 * All sends are skipped (without raising) when the member has no email on
 * record. The function is intentionally fire-and-forget for the caller: it
 * only returns a summary, never throws — so a queue outage cannot break the
 * member-creation HTTP response.
 */
export async function enqueueMemberRegistrationEmails(
  input: MemberRegistrationEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("welcome:no_email")
    result.skipped.push("kyc:no_email")
    if (input.invoice) result.skipped.push("invoice:no_email")
    return result
  }

  const memberId = input.member.id
  const welcomeJob: EmailJobData = {
    to: email,
    subject: `Welcome to ${input.institutionName}`,
    template: EMAIL_TEMPLATES.memberWelcome,
    kind: "template",
    data: {
      memberName: input.member.full_name,
      memberNumber: input.member.member_number,
      institutionName: input.institutionName,
      accountType: input.savingsAccount?.account_type || null,
      accountNumber: input.savingsAccount?.account_number || null,
    },
    context: input.context,
  }
  await enqueueMemberEmail(memberId, welcomeJob, "welcome", result)

  const kycJob: EmailJobData = {
    to: email,
    subject: "Verify your KYC documents",
    template: EMAIL_TEMPLATES.memberKycRequired,
    kind: "template",
    data: {
      memberName: input.member.full_name,
      memberNumber: input.member.member_number,
      institutionName: input.institutionName,
    },
    context: input.context,
  }
  await enqueueMemberEmail(memberId, kycJob, "kyc", result)

  if (input.invoice) {
    const invoiceJob: EmailJobData = {
      to: email,
      subject: `Membership Fee Invoice ${input.invoice.invoice_number}`,
      template: EMAIL_TEMPLATES.memberInvoice,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        invoiceNumber: input.invoice.invoice_number,
        amount: input.invoice.total_amount,
        currency: input.currency || "UGX",
        dueDate: input.invoice.invoice_due || null,
      },
      attachmentSpecs: [{ kind: "invoice", invoiceId: input.invoice.id }],
      context: input.context,
    }
    await enqueueMemberEmail(memberId, invoiceJob, "invoice", result)
  }

  return result
}
