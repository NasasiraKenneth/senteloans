import { enqueueMemberEmail } from "./enqueue-member-email"
import type { EmailContext } from "./types"

export const INVOICE_PAYMENT_EMAIL_TEMPLATES = {
  paymentRecorded: "invoice.payment_recorded",
} as const

export interface InvoicePaymentEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface InvoicePaymentEmailInput {
  member: InvoicePaymentEmailMember
  institutionName: string
  currency?: string
  payment: {
    amount: number
    outstanding: number
    fullySettled: boolean
  }
  invoice: {
    id: string
    invoice_number: string
  }
  transaction: {
    id: string
    transaction_number: string
  }
  context?: EmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

export async function enqueueInvoicePaymentEmail(
  input: InvoicePaymentEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("invoice_payment:no_email")
    return result
  }

  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: `Payment Received — Invoice ${input.invoice.invoice_number}`,
      template: INVOICE_PAYMENT_EMAIL_TEMPLATES.paymentRecorded,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        amount: input.payment.amount,
        outstanding: input.payment.outstanding,
        fullySettled: input.payment.fullySettled,
        currency: input.currency || "UGX",
        invoiceNumber: input.invoice.invoice_number,
        transactionNumber: input.transaction.transaction_number,
      },
      attachmentSpecs: [{ kind: "receipt", transactionId: input.transaction.id }],
      context: input.context,
    },
    "invoice_payment",
    result,
  )

  return result
}
