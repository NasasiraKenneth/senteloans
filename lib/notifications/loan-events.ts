import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput, NotificationType } from "./notification-types"
import { getInstitutionRecipientsWithPermission } from "./admin-recipients"

const PERMISSIONS = {
  viewLoans: "view_loans",
} as const

export interface LoanApplicationActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface LoanApplicationMember {
  id: string
  full_name: string
}

export interface LoanApplicationSummary {
  id: string
  application_id: string
  principal_amount: number
  loan_type: string
  product_name?: string | null
}

export interface NotifyLoanApplicationCreatedInput {
  client?: PoolClient
  actor: LoanApplicationActor
  member: LoanApplicationMember
  loan: LoanApplicationSummary
  currency?: string
}

export interface NotifyLoanApplicationCreatedResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications when a new loan application is created.
 *
 * Member receives `loan_application_submitted`.
 * Staff with `view_loans` receive `pending_loan_approval`.
 */
export async function notifyLoanApplicationCreated(
  input: NotifyLoanApplicationCreatedInput,
): Promise<NotifyLoanApplicationCreatedResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0
  const { actor, member, loan } = input

  const memberTpl = NotificationTemplates.loanApplicationSubmitted(
    loan.id,
    loan.principal_amount,
    loan.application_id,
    loan.product_name,
  )
  const memberRes = await notificationService.create(
    {
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: member.id,
      type: "loan_application_submitted",
      title: memberTpl.title,
      message: memberTpl.message,
      actionUrl: memberTpl.actionUrl,
      metadata: {
        loan_id: loan.id,
        application_id: loan.application_id,
        amount: loan.principal_amount,
        loan_type: loan.loan_type,
        product_name: loan.product_name ?? undefined,
      },
    },
    input.client,
  )
  if (memberRes.ok) {
    memberNotifications = 1
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  if (!input.client) {
    return { ok: errors.length === 0, memberNotifications, staffNotifications, errors }
  }

  let recipients: Awaited<ReturnType<typeof getInstitutionRecipientsWithPermission>> = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewLoans,
    )
  } catch (e) {
    errors.push(`recipients:view_loans:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, memberNotifications, staffNotifications, errors }
  }

  if (recipients.length > 0) {
    const staffTpl = NotificationTemplates.pendingLoanApproval(
      member.full_name,
      loan.principal_amount,
      loan.id,
      loan.application_id,
      loan.product_name,
    )
    const metadata: CreateNotificationInput["metadata"] = {
      loan_id: loan.id,
      application_id: loan.application_id,
      member_id: member.id,
      member_name: member.full_name,
      amount: loan.principal_amount,
      loan_type: loan.loan_type,
      product_name: loan.product_name ?? undefined,
    }

    const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
      institutionId: actor.institution_id,
      branchId: r.branch_id ?? actor.branch_id,
      recipientType: "institution_user",
      recipientId: r.id,
      type: "pending_loan_approval",
      title: staffTpl.title,
      message: staffTpl.message,
      actionUrl: staffTpl.actionUrl,
      metadata,
    }))

    const staffRes = await notificationService.createBulk(staffMessages, input.client)
    if (staffRes.ok) {
      staffNotifications = staffRes.count ?? staffMessages.length
    } else if (staffRes.error) {
      errors.push(`staff_notifications:pending_loan_approval:${staffRes.error}`)
    }
  }

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}

export interface LoanStatusChangeActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface LoanStatusChangeMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface LoanStatusChangeLoan {
  id: string
  application_id: string
  principal_amount: number
  loan_type: string
  product_name?: string | null
}

export interface NotifyLoanStatusChangedInput {
  client?: PoolClient
  actor: LoanStatusChangeActor
  member: LoanStatusChangeMember
  loan: LoanStatusChangeLoan
  newStatus: string
  currency?: string
}

export interface NotifyLoanStatusChangedResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

const MEMBER_NOTIFY_STATUSES = new Set([
  "Under Review",
  "Reviewed",
  "Approved",
  "Rejected",
  "Fully Disbursed",
  "Partially Disbursed",
])

/** Staff with view_loans are alerted on every tracked loan status change. */
const STAFF_NOTIFY_STATUSES = MEMBER_NOTIFY_STATUSES

function memberNotificationForStatus(
  status: string,
  loan: LoanStatusChangeLoan,
): { type: NotificationType; tpl: { title: string; message: string; actionUrl?: string } } | null {
  const amount = Number(loan.principal_amount || 0)
  const { id: loanId, application_id: applicationId, product_name: productName } = loan
  switch (status) {
    case "Under Review":
      return { type: "loan_under_review", tpl: NotificationTemplates.loanUnderReview(loanId, amount, applicationId, productName) }
    case "Reviewed":
      return { type: "loan_reviewed", tpl: NotificationTemplates.loanReviewed(loanId, amount, applicationId, productName) }
    case "Approved":
      return { type: "loan_approved", tpl: NotificationTemplates.loanApproved(loanId, amount, applicationId, productName) }
    case "Rejected":
      return { type: "loan_rejected", tpl: NotificationTemplates.loanRejected(loanId, amount, applicationId, productName) }
    case "Partially Disbursed":
      return { type: "loan_partially_disbursed", tpl: NotificationTemplates.loanPartiallyDisbursed(loanId, amount, applicationId, productName) }
    case "Fully Disbursed":
      return { type: "loan_disbursed", tpl: NotificationTemplates.loanDisbursed(loanId, amount, applicationId, productName) }
    default:
      return null
  }
}

function staffNotificationForStatus(
  status: string,
  memberName: string,
  loan: LoanStatusChangeLoan,
): { type: NotificationType; tpl: { title: string; message: string; actionUrl?: string } } | null {
  const amount = Number(loan.principal_amount || 0)
  const { id: loanId, application_id: applicationId, product_name: productName } = loan
  switch (status) {
    case "Under Review":
      return {
        type: "loan_under_review",
        tpl: NotificationTemplates.loanUnderReviewStaff(memberName, applicationId, amount, loanId, productName),
      }
    case "Reviewed":
      return {
        type: "loan_ready_for_approval",
        tpl: NotificationTemplates.loanReadyForApprovalStaff(memberName, applicationId, amount, loanId, productName),
      }
    case "Approved":
      return {
        type: "loan_approved",
        tpl: NotificationTemplates.loanApprovedStaff(memberName, applicationId, amount, loanId, productName),
      }
    case "Rejected":
      return {
        type: "loan_rejected",
        tpl: NotificationTemplates.loanRejectedStaff(memberName, applicationId, amount, loanId, productName),
      }
    case "Partially Disbursed":
      return {
        type: "loan_partially_disbursed",
        tpl: NotificationTemplates.loanPartiallyDisbursedStaff(memberName, applicationId, amount, loanId, productName),
      }
    case "Fully Disbursed":
      return {
        type: "loan_disbursed",
        tpl: NotificationTemplates.loanFullyDisbursedStaff(memberName, applicationId, amount, loanId, productName),
      }
    default:
      return null
  }
}

/**
 * Fan out in-app notifications when a loan status changes via PUT /api/institution/loans/[id].
 *
 * Member receives status-specific notifications for review, approval, rejection, and disbursement.
 * Staff with `view_loans` (including the actor) receive in-app alerts for every tracked status change.
 */
export async function notifyLoanStatusChanged(
  input: NotifyLoanStatusChangedInput,
): Promise<NotifyLoanStatusChangedResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0
  const { actor, member, loan, newStatus } = input
  const amount = Number(loan.principal_amount || 0)

  if (MEMBER_NOTIFY_STATUSES.has(newStatus)) {
    const memberNotif = memberNotificationForStatus(newStatus, loan)
    if (memberNotif) {
      const memberRes = await notificationService.create(
        {
          institutionId: actor.institution_id,
          branchId: actor.branch_id,
          recipientType: "member",
          recipientId: member.id,
          type: memberNotif.type,
          title: memberNotif.tpl.title,
          message: memberNotif.tpl.message,
          actionUrl: memberNotif.tpl.actionUrl,
          metadata: {
            loan_id: loan.id,
            application_id: loan.application_id,
            amount,
            status: newStatus,
            loan_type: loan.loan_type,
            product_name: loan.product_name ?? undefined,
          },
        },
        input.client,
      )
      if (memberRes.ok) {
        memberNotifications = 1
      } else if (memberRes.error) {
        errors.push(`member_notifications:${memberRes.error}`)
      }
    }
  }

  if (!input.client || !STAFF_NOTIFY_STATUSES.has(newStatus)) {
    return { ok: errors.length === 0, memberNotifications, staffNotifications, errors }
  }

  let recipients: Awaited<ReturnType<typeof getInstitutionRecipientsWithPermission>> = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewLoans,
    )
  } catch (e) {
    errors.push(`recipients:view_loans:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, memberNotifications, staffNotifications, errors }
  }

  const staffNotif = staffNotificationForStatus(newStatus, member.full_name, loan)

  if (recipients.length > 0 && staffNotif) {
    const metadata: CreateNotificationInput["metadata"] = {
      loan_id: loan.id,
      application_id: loan.application_id,
      member_id: member.id,
      member_name: member.full_name,
      amount,
      status: newStatus,
      product_name: loan.product_name ?? undefined,
    }

    const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
      institutionId: actor.institution_id,
      branchId: r.branch_id ?? actor.branch_id,
      recipientType: "institution_user",
      recipientId: r.id,
      type: staffNotif.type,
      title: staffNotif.tpl.title,
      message: staffNotif.tpl.message,
      actionUrl: staffNotif.tpl.actionUrl,
      metadata,
    }))

    const staffRes = await notificationService.createBulk(staffMessages, input.client)
    if (staffRes.ok) {
      staffNotifications = staffRes.count ?? staffMessages.length
    } else if (staffRes.error) {
      errors.push(`staff_notifications:${staffNotif.type}:${staffRes.error}`)
    }
  }

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}
