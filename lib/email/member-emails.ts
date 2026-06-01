import { enqueueEmail, type EmailJobData } from "@/queues/email.queue"

/**
 * Templates the email worker is expected to resolve. The worker currently logs
 * the job and returns ok — these are placeholders so we have a stable contract
 * once a real mail provider is wired in.
 */
export const EMAIL_TEMPLATES = {
  memberWelcome: "member.welcome",
  memberKycRequired: "member.kyc_required",
  memberInvoice: "member.invoice",
} as const

export interface EmailContext {
  institutionId?: string
  actorId?: string
}

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

export interface MemberRegistrationEmailInput {
  member: MemberSummary
  institutionName: string
  currency?: string
  invoice?: InvoiceEmailSummary | null
  context?: EmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

const enqueueSafely = async (
  data: EmailJobData,
  label: string,
  out: EnqueuedEmailsResult,
): Promise<void> => {
  try {
    await enqueueEmail(data)
    out.enqueued.push(label)
  } catch (e) {
    out.errors.push(`${label}:${(e as Error)?.message || "enqueue_failed"}`)
  }
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

  await enqueueSafely(
    {
      to: email,
      subject: `Welcome to ${input.institutionName}`,
      template: EMAIL_TEMPLATES.memberWelcome,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
      },
      context: input.context,
    },
    "welcome",
    result,
  )

  await enqueueSafely(
    {
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
    },
    "kyc",
    result,
  )

  if (input.invoice) {
    await enqueueSafely(
      {
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
        context: input.context,
      },
      "invoice",
      result,
    )
  }

  return result
}
