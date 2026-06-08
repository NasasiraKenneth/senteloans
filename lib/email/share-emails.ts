import { enqueueEmail } from "@/queues/email.queue"

/**
 * Email templates the worker resolves for share-purchase events. Placeholder
 * contract until a real mail provider is wired in (mirrors member-emails).
 */
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

export interface SharePurchaseEmailInput {
  member: ShareEmailMember
  institutionName: string
  currency?: string
  shares: { numberOfShares: number; totalValue: number }
  invoice?: ShareEmailInvoice | null
  context?: { institutionId?: string; actorId?: string }
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue the share-purchase confirmation email. Skipped (without raising) when
 * the member has no email on record. Fire-and-forget: returns a summary, never
 * throws — a queue outage cannot break the purchase HTTP response.
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

  try {
    await enqueueEmail({
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
      },
      context: input.context,
    })
    result.enqueued.push("shares_purchase")
  } catch (e) {
    result.errors.push(`shares_purchase:${(e as Error)?.message || "enqueue_failed"}`)
  }

  return result
}
