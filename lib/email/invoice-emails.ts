import { enqueueMemberEmail } from "./enqueue-member-email"
import type { EmailContext } from "./types"

export const INVOICE_EMAIL_TEMPLATES = {
  invoiceSent: "invoice.sent",
} as const

export interface InvoiceEmailMember {
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

export interface InvoiceSentEmailInput {
  member: InvoiceEmailMember
  institutionName: string
  currency?: string
  invoice: InvoiceEmailSummary
  context?: EmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue the invoice email for a sent member invoice with the PDF attached.
 * Skipped (without raising) when the member has no email on record.
 */
export async function enqueueInvoiceSentEmail(
  input: InvoiceSentEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("invoice_sent:no_email")
    return result
  }

  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: `Invoice ${input.invoice.invoice_number}`,
      template: INVOICE_EMAIL_TEMPLATES.invoiceSent,
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
    },
    "invoice_sent",
    result,
  )

  return result
}
