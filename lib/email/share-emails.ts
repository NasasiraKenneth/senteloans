import { enqueueMemberEmail } from "./enqueue-member-email"
import type { EmailAttachmentSpec } from "./types"

export const SHARE_EMAIL_TEMPLATES = {
  sharesPurchased: "shares.purchased",
} as const

export interface ShareEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface ShareEmailInvoice {
  id: string
  invoice_number: string
  total_amount: number
}

export interface ShareEmailTransaction {
  id: string
  transaction_number: string
}

export interface SharePurchaseEmailInput {
  member: ShareEmailMember
  institutionName: string
  currency?: string
  shares: { numberOfShares: number; totalValue: number }
  transaction: ShareEmailTransaction
  invoice?: ShareEmailInvoice | null
  context?: { institutionId?: string; branchId?: string; actorId?: string }
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue the share-purchase confirmation email with invoice + receipt PDFs.
 * Skipped (without raising) when the member has no email on record.
 */
export async function enqueueSharePurchaseEmails(
  input: SharePurchaseEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("shares_purchase:no_email")
    return result
  }

  const attachmentSpecs: EmailAttachmentSpec[] = []
  if (input.invoice?.id) {
    attachmentSpecs.push({ kind: "invoice", invoiceId: input.invoice.id })
  }
  attachmentSpecs.push({ kind: "receipt", transactionId: input.transaction.id })

  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: input.invoice
        ? `Shares Purchase Confirmation — Invoice ${input.invoice.invoice_number}`
        : "Shares Purchase Confirmation",
      template: SHARE_EMAIL_TEMPLATES.sharesPurchased,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        numberOfShares: input.shares.numberOfShares,
        amount: input.shares.totalValue,
        currency: input.currency || "UGX",
        invoiceNumber: input.invoice?.invoice_number || null,
        transactionNumber: input.transaction.transaction_number,
      },
      attachmentSpecs,
      context: input.context,
    },
    "shares_purchase",
    result,
  )

  return result
}
