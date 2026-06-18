import { enqueueMemberEmail } from "./enqueue-member-email"
import type { EmailJobData } from "@/queues/email.queue"

export const KYC_EMAIL_TEMPLATES = {
  submitted: "kyc.submitted",
  uploaded: "kyc.uploaded",
  approved: "kyc.approved",
  rejected: "kyc.rejected",
} as const

export interface KycEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export type KycEmailContext = NonNullable<EmailJobData["context"]>

export interface KycEmailInput {
  member: KycEmailMember
  institutionName: string
  docType: string
  docTypeLabel?: string
  reason?: string | null
  context?: KycEmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

function formatDocType(docType: string): string {
  return docType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Enqueue a KYC submission confirmation email to the member.
 */
export async function enqueueKycSubmittedEmail(
  input: KycEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }
  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("kyc_submitted:no_email")
    return result
  }

  const docTypeLabel = input.docTypeLabel || formatDocType(input.docType)
  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: "KYC document submitted",
      template: KYC_EMAIL_TEMPLATES.submitted,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        docType: input.docType,
        docTypeLabel,
      },
      context: input.context,
    },
    "kyc_submitted",
    result,
  )
  return result
}

/**
 * Enqueue a KYC upload confirmation email when staff uploads a document on
 * behalf of a member (edit member page).
 */
export async function enqueueKycUploadedEmail(
  input: KycEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }
  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("kyc_uploaded:no_email")
    return result
  }

  const docTypeLabel = input.docTypeLabel || formatDocType(input.docType)
  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: "KYC document submitted",
      template: KYC_EMAIL_TEMPLATES.uploaded,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        docType: input.docType,
        docTypeLabel,
      },
      context: input.context,
    },
    "kyc_uploaded",
    result,
  )
  return result
}

/**
 * Enqueue a KYC approval confirmation email to the member.
 */
export async function enqueueKycApprovedEmail(
  input: KycEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }
  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("kyc_approved:no_email")
    return result
  }

  const docTypeLabel = input.docTypeLabel || formatDocType(input.docType)
  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: "KYC document approved",
      template: KYC_EMAIL_TEMPLATES.approved,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        docType: input.docType,
        docTypeLabel,
      },
      context: input.context,
    },
    "kyc_approved",
    result,
  )
  return result
}

/**
 * Enqueue a KYC rejection email to the member with the review reason.
 */
export async function enqueueKycRejectedEmail(
  input: KycEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }
  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("kyc_rejected:no_email")
    return result
  }

  const docTypeLabel = input.docTypeLabel || formatDocType(input.docType)
  const reason = input.reason?.trim() || "Document did not meet requirements"
  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: "KYC document rejected",
      template: KYC_EMAIL_TEMPLATES.rejected,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        docType: input.docType,
        docTypeLabel,
        reason,
      },
      context: input.context,
    },
    "kyc_rejected",
    result,
  )
  return result
}
