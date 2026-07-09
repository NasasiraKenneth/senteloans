import type { PoolClient } from "pg"
import { runWithoutAuth } from "@/lib/db"
import { getInstitutionStaffRecipientsWithPermission } from "@/lib/notifications/admin-recipients"
import { enqueueMemberEmail } from "./enqueue-member-email"
import { enqueueStaffEmail } from "./enqueue-staff-email"
import type { EmailJobData } from "@/queues/email.queue"

export const LOAN_EMAIL_TEMPLATES = {
  applicationSubmitted: "loan.application_submitted",
  pendingApproval: "loan.pending_approval",
  underReview: "loan.under_review",
  reviewed: "loan.reviewed",
  approved: "loan.approved",
  rejected: "loan.rejected",
  partiallyDisbursed: "loan.partially_disbursed",
  disbursed: "loan.disbursed",
  readyForApproval: "loan.ready_for_approval",
  underReviewStaff: "loan.under_review_staff",
  approvedStaff: "loan.approved_staff",
  rejectedStaff: "loan.rejected_staff",
  partiallyDisbursedStaff: "loan.partially_disbursed_staff",
  fullyDisbursedStaff: "loan.fully_disbursed_staff",
} as const

export interface LoanEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface LoanEmailLoan {
  id: string
  application_id: string
  principal_amount: number
  loan_type: string
  product_name?: string | null
}

export type LoanEmailContext = NonNullable<EmailJobData["context"]>

export interface LoanApplicationEmailInput {
  client?: PoolClient
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency?: string
  member: LoanEmailMember
  loan: LoanEmailLoan
  context?: LoanEmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

function formatLoanType(loanType: string): string {
  const normalized = loanType.trim().toLowerCase()
  if (normalized === "top up") return "Top-up"
  if (normalized === "buy off") return "Buy-off"
  return "Normal"
}

/**
 * Enqueue member + staff emails for a newly created loan application.
 * Staff recipients are every Active user with `view_loans`, excluding the actor.
 */
export async function enqueueLoanApplicationEmails(
  input: LoanApplicationEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }
  const loanTypeLabel = formatLoanType(input.loan.loan_type)
  const commonData = {
    institutionName: input.institutionName,
    currency: input.currency || "UGX",
    memberName: input.member.full_name,
    memberNumber: input.member.member_number,
    applicationId: input.loan.application_id,
    principalAmount: input.loan.principal_amount,
    loanType: loanTypeLabel,
    productName: input.loan.product_name || null,
    loanId: input.loan.id,
  }

  const memberEmail = input.member.email?.trim()
  if (memberEmail) {
    await enqueueMemberEmail(
      input.member.id,
      {
        to: memberEmail,
        subject: `Loan application submitted — ${input.loan.application_id}`,
        template: LOAN_EMAIL_TEMPLATES.applicationSubmitted,
        kind: "template",
        data: commonData,
        context: input.context,
      },
      "loan_application_member",
      result,
    )
  } else {
    result.skipped.push("loan_application_member:no_email")
  }

  const loadStaff = async (client: PoolClient) =>
    getInstitutionStaffRecipientsWithPermission(
      client,
      input.institutionId,
      "view_loans",
      { excludeUserId: input.actorId },
    )

  let staffRecipients: Awaited<ReturnType<typeof getInstitutionStaffRecipientsWithPermission>> = []
  try {
    if (input.client) {
      staffRecipients = await loadStaff(input.client)
    } else {
      staffRecipients = await runWithoutAuth(loadStaff)
    }
  } catch (e) {
    result.errors.push(`loan_application_staff_recipients:${(e as Error)?.message || "lookup_failed"}`)
    return result
  }

  for (const staff of staffRecipients) {
    const email = staff.email?.trim()
    if (!email) {
      result.skipped.push(`loan_application_staff:${staff.id}:no_email`)
      continue
    }

    const staffName = staff.full_name?.trim() || "Team member"
    await enqueueStaffEmail(
      staff.id,
      {
        to: email,
        subject: `New loan application — ${input.loan.application_id}`,
        template: LOAN_EMAIL_TEMPLATES.pendingApproval,
        kind: "template",
        data: {
          ...commonData,
          staffName,
        },
        context: input.context,
      },
      `loan_application_staff:${staff.id}`,
      result,
    )
  }

  return result
}

export interface LoanStatusEmailInput {
  client?: PoolClient
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency?: string
  member: LoanEmailMember
  loan: LoanEmailLoan
  newStatus: string
  context?: LoanEmailContext
}

const MEMBER_EMAIL_STATUSES = new Set([
  "Under Review",
  "Reviewed",
  "Approved",
  "Rejected",
  "Fully Disbursed",
  "Partially Disbursed",
])

const STAFF_EMAIL_STATUSES = MEMBER_EMAIL_STATUSES

function memberEmailForStatus(
  status: string,
): { template: string; subject: string } | null {
  switch (status) {
    case "Under Review":
      return { template: LOAN_EMAIL_TEMPLATES.underReview, subject: "Loan under review" }
    case "Reviewed":
      return { template: LOAN_EMAIL_TEMPLATES.reviewed, subject: "Loan review complete" }
    case "Approved":
      return { template: LOAN_EMAIL_TEMPLATES.approved, subject: "Loan application approved" }
    case "Rejected":
      return { template: LOAN_EMAIL_TEMPLATES.rejected, subject: "Loan application update" }
    case "Partially Disbursed":
      return { template: LOAN_EMAIL_TEMPLATES.partiallyDisbursed, subject: "Loan partially disbursed" }
    case "Fully Disbursed":
      return { template: LOAN_EMAIL_TEMPLATES.disbursed, subject: "Loan fully disbursed" }
    default:
      return null
  }
}

function staffEmailForStatus(
  status: string,
): { template: string; subject: string } | null {
  switch (status) {
    case "Under Review":
      return { template: LOAN_EMAIL_TEMPLATES.underReviewStaff, subject: "Loan under review" }
    case "Reviewed":
      return { template: LOAN_EMAIL_TEMPLATES.readyForApproval, subject: "Loan ready for approval" }
    case "Approved":
      return { template: LOAN_EMAIL_TEMPLATES.approvedStaff, subject: "Loan approved" }
    case "Rejected":
      return { template: LOAN_EMAIL_TEMPLATES.rejectedStaff, subject: "Loan rejected" }
    case "Partially Disbursed":
      return { template: LOAN_EMAIL_TEMPLATES.partiallyDisbursedStaff, subject: "Loan partially disbursed" }
    case "Fully Disbursed":
      return { template: LOAN_EMAIL_TEMPLATES.fullyDisbursedStaff, subject: "Loan fully disbursed" }
    default:
      return null
  }
}

/**
 * Enqueue member and staff emails after a loan status change.
 * Staff emails are sent for every tracked status change.
 */
export async function enqueueLoanStatusEmails(
  input: LoanStatusEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }
  const loanTypeLabel = formatLoanType(input.loan.loan_type)
  const commonData = {
    institutionName: input.institutionName,
    currency: input.currency || "UGX",
    memberName: input.member.full_name,
    memberNumber: input.member.member_number,
    applicationId: input.loan.application_id,
    principalAmount: input.loan.principal_amount,
    loanType: loanTypeLabel,
    productName: input.loan.product_name || null,
    loanId: input.loan.id,
    statusLabel: input.newStatus,
  }

  if (MEMBER_EMAIL_STATUSES.has(input.newStatus)) {
    const memberEmailSpec = memberEmailForStatus(input.newStatus)
    const memberEmail = input.member.email?.trim()
    if (memberEmailSpec && memberEmail) {
      await enqueueMemberEmail(
        input.member.id,
        {
          to: memberEmail,
          subject: `${memberEmailSpec.subject} — ${input.loan.application_id}`,
          template: memberEmailSpec.template,
          kind: "template",
          data: commonData,
          context: input.context,
        },
        `loan_status_member:${input.newStatus}`,
        result,
      )
    } else if (!memberEmail) {
      result.skipped.push(`loan_status_member:${input.newStatus}:no_email`)
    }
  }

  if (!STAFF_EMAIL_STATUSES.has(input.newStatus)) {
    return result
  }

  const staffEmailSpec = staffEmailForStatus(input.newStatus)
  if (!staffEmailSpec) {
    return result
  }

  const loadStaff = async (client: PoolClient) =>
    getInstitutionStaffRecipientsWithPermission(
      client,
      input.institutionId,
      "view_loans",
      { excludeUserId: input.actorId },
    )

  let staffRecipients: Awaited<ReturnType<typeof getInstitutionStaffRecipientsWithPermission>> = []
  try {
    if (input.client) {
      staffRecipients = await loadStaff(input.client)
    } else {
      staffRecipients = await runWithoutAuth(loadStaff)
    }
  } catch (e) {
    result.errors.push(`loan_status_staff_recipients:${(e as Error)?.message || "lookup_failed"}`)
    return result
  }

  for (const staff of staffRecipients) {
    const email = staff.email?.trim()
    if (!email) {
      result.skipped.push(`loan_status_staff:${staff.id}:no_email`)
      continue
    }

    const staffName = staff.full_name?.trim() || "Team member"
    await enqueueStaffEmail(
      staff.id,
      {
        to: email,
        subject: `${staffEmailSpec.subject} — ${input.loan.application_id}`,
        template: staffEmailSpec.template,
        kind: "template",
        data: { ...commonData, staffName },
        context: input.context,
      },
      `loan_status_staff:${staff.id}:${input.newStatus}`,
      result,
    )
  }

  return result
}
