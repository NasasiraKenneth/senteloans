import { enqueueMemberEmail } from "./enqueue-member-email"
import type { EmailAttachmentSpec } from "./types"

export const SHARE_EMAIL_TEMPLATES = {
  sharesPurchased: "shares.purchased",
  sharesTransferred: "shares.transferred",
  sharesReceived: "shares.received",
  sharesSold: "shares.sold",
  sharesBuyOff: "shares.buy_out",
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

export interface ShareTransferEmailInput {
  fromMember: ShareEmailMember
  toMember: ShareEmailMember
  institutionName: string
  currency?: string
  shares: { numberOfShares: number; totalValue: number }
  fromTransaction: ShareEmailTransaction
  toTransaction: ShareEmailTransaction
  context?: { institutionId?: string; branchId?: string; actorId?: string }
}

export interface ShareBuyOffEmailInput {
  sellerMember: ShareEmailMember
  buyerMember: ShareEmailMember
  institutionName: string
  currency?: string
  shares: { numberOfShares: number; totalValue: number }
  sellerTransaction: ShareEmailTransaction
  buyerTransaction: ShareEmailTransaction
  sellerSavingsTransaction?: ShareEmailTransaction | null
  buyerSavingsTransaction?: ShareEmailTransaction | null
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

/**
 * Enqueue share transfer emails for sender and receiver, each with transaction receipt PDF.
 */
export async function enqueueShareTransferEmails(
  input: ShareTransferEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const fromEmail = input.fromMember.email?.trim()
  if (fromEmail) {
    await enqueueMemberEmail(
      input.fromMember.id,
      {
        to: fromEmail,
        subject: `Shares Transfer Confirmation — Transferred to ${input.toMember.full_name}`,
        template: SHARE_EMAIL_TEMPLATES.sharesTransferred,
        kind: "template",
        data: {
          memberName: input.fromMember.full_name,
          memberNumber: input.fromMember.member_number,
          targetMemberName: input.toMember.full_name,
          institutionName: input.institutionName,
          numberOfShares: input.shares.numberOfShares,
          amount: input.shares.totalValue,
          currency: input.currency || "UGX",
          transactionNumber: input.fromTransaction.transaction_number,
        },
        attachmentSpecs: [{ kind: "receipt", transactionId: input.fromTransaction.id }],
        context: input.context,
      },
      "shares_transfer_out",
      result,
    )
  } else {
    result.skipped.push("shares_transfer_out:no_email")
  }

  const toEmail = input.toMember.email?.trim()
  if (toEmail) {
    await enqueueMemberEmail(
      input.toMember.id,
      {
        to: toEmail,
        subject: `Shares Received — Transfer from ${input.fromMember.full_name}`,
        template: SHARE_EMAIL_TEMPLATES.sharesReceived,
        kind: "template",
        data: {
          memberName: input.toMember.full_name,
          memberNumber: input.toMember.member_number,
          sourceMemberName: input.fromMember.full_name,
          institutionName: input.institutionName,
          numberOfShares: input.shares.numberOfShares,
          amount: input.shares.totalValue,
          currency: input.currency || "UGX",
          transactionNumber: input.toTransaction.transaction_number,
        },
        attachmentSpecs: [{ kind: "receipt", transactionId: input.toTransaction.id }],
        context: input.context,
      },
      "shares_transfer_in",
      result,
    )
  } else {
    result.skipped.push("shares_transfer_in:no_email")
  }

  return result
}

/**
 * Enqueue share buy-off/sell confirmation emails for seller and buyer, with receipt PDFs.
 */
export async function enqueueShareBuyOffEmails(
  input: ShareBuyOffEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const sellerEmail = input.sellerMember.email?.trim()
  if (sellerEmail) {
    const attachmentSpecs: EmailAttachmentSpec[] = [
      { kind: "receipt", transactionId: input.sellerTransaction.id },
    ]
    if (input.sellerSavingsTransaction?.id) {
      attachmentSpecs.push({ kind: "receipt", transactionId: input.sellerSavingsTransaction.id })
    }

    await enqueueMemberEmail(
      input.sellerMember.id,
      {
        to: sellerEmail,
        subject: `Shares Sale Confirmation — Sold to ${input.buyerMember.full_name}`,
        template: SHARE_EMAIL_TEMPLATES.sharesSold,
        kind: "template",
        data: {
          memberName: input.sellerMember.full_name,
          memberNumber: input.sellerMember.member_number,
          buyerMemberName: input.buyerMember.full_name,
          institutionName: input.institutionName,
          numberOfShares: input.shares.numberOfShares,
          amount: input.shares.totalValue,
          currency: input.currency || "UGX",
          transactionNumber: input.sellerTransaction.transaction_number,
          savingsTransactionNumber: input.sellerSavingsTransaction?.transaction_number || null,
        },
        attachmentSpecs,
        context: input.context,
      },
      "shares_sold",
      result,
    )
  } else {
    result.skipped.push("shares_sold:no_email")
  }

  const buyerEmail = input.buyerMember.email?.trim()
  if (buyerEmail) {
    const attachmentSpecs: EmailAttachmentSpec[] = [
      { kind: "receipt", transactionId: input.buyerTransaction.id },
    ]
    if (input.buyerSavingsTransaction?.id) {
      attachmentSpecs.push({ kind: "receipt", transactionId: input.buyerSavingsTransaction.id })
    }

    await enqueueMemberEmail(
      input.buyerMember.id,
      {
        to: buyerEmail,
        subject: `Shares Purchase Confirmation — Bought from ${input.sellerMember.full_name}`,
        template: SHARE_EMAIL_TEMPLATES.sharesBuyOff,
        kind: "template",
        data: {
          memberName: input.buyerMember.full_name,
          memberNumber: input.buyerMember.member_number,
          sellerMemberName: input.sellerMember.full_name,
          institutionName: input.institutionName,
          numberOfShares: input.shares.numberOfShares,
          amount: input.shares.totalValue,
          currency: input.currency || "UGX",
          transactionNumber: input.buyerTransaction.transaction_number,
          savingsTransactionNumber: input.buyerSavingsTransaction?.transaction_number || null,
        },
        attachmentSpecs,
        context: input.context,
      },
      "shares_buy_out",
      result,
    )
  } else {
    result.skipped.push("shares_buy_out:no_email")
  }

  return result
}
