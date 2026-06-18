import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import { getInstitutionRecipientsWithPermission } from "./admin-recipients"

const PERMISSIONS = {
  members: "view_members",
} as const

export interface KycActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface KycMember {
  id: string
  full_name: string
  member_number?: string
}

export interface NotifyKycSubmittedInput {
  client?: PoolClient
  institutionId: string
  branchId: string
  /** Staff actor when upload is staff-initiated; omit for member self-submit. */
  actor?: KycActor | null
  member: KycMember
  docType: string
}

export interface NotifyKycReviewInput {
  client?: PoolClient
  actor: KycActor
  member: KycMember
  docType: string
  reason?: string
}

export interface NotifyKycResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications when a KYC document is submitted for review.
 *
 * Member receives `kyc_submitted`. Staff with `view_members` receive
 * `pending_kyc_review` (actor excluded when present).
 */
export async function notifyKycSubmitted(
  input: NotifyKycSubmittedInput,
): Promise<NotifyKycResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const submittedTpl = NotificationTemplates.kycSubmitted(input.docType)
  const memberRes = await notificationService.create(
    {
      institutionId: input.institutionId,
      branchId: input.branchId,
      recipientType: "member",
      recipientId: input.member.id,
      type: "kyc_submitted",
      title: submittedTpl.title,
      message: submittedTpl.message,
      actionUrl: submittedTpl.actionUrl,
      metadata: { doc_type: input.docType, member_id: input.member.id },
    },
    input.client,
  )
  if (memberRes.ok) {
    memberNotifications = 1
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  if (input.client) {
    let recipients: { id: string; branch_id: string | null }[] = []
    try {
      recipients = await getInstitutionRecipientsWithPermission(
        input.client,
        input.institutionId,
        PERMISSIONS.members,
        { excludeUserId: input.actor?.id ?? null },
      )
    } catch (e) {
      errors.push(`recipients:${PERMISSIONS.members}:${(e as Error)?.message || "lookup_failed"}`)
    }

    if (recipients.length > 0) {
      const reviewTpl = NotificationTemplates.pendingKycReview(
        input.member.full_name,
        input.docType,
        input.member.id,
      )
      const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
        institutionId: input.institutionId,
        branchId: r.branch_id ?? input.branchId,
        recipientType: "institution_user",
        recipientId: r.id,
        type: "pending_kyc_review",
        title: reviewTpl.title,
        message: reviewTpl.message,
        actionUrl: reviewTpl.actionUrl,
        metadata: {
          member_id: input.member.id,
          member_name: input.member.full_name,
          doc_type: input.docType,
        },
      }))
      const staffRes = await notificationService.createBulk(staffMessages, input.client)
      if (staffRes.ok) {
        staffNotifications = staffRes.count ?? staffMessages.length
      } else if (staffRes.error) {
        errors.push(`staff_notifications:pending_kyc_review:${staffRes.error}`)
      }
    }
  }

  return { ok: errors.length === 0, memberNotifications, staffNotifications, errors }
}

/** Member receives `kyc_submitted` when staff uploads a document on their behalf. */
export async function notifyKycUploaded(
  input: NotifyKycReviewInput,
): Promise<NotifyKycResult> {
  const errors: string[] = []
  let memberNotifications = 0

  const tpl = NotificationTemplates.kycUploaded(input.docType)
  const res = await notificationService.create(
    {
      institutionId: input.actor.institution_id,
      branchId: input.actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "kyc_submitted",
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata: { doc_type: input.docType, member_id: input.member.id },
    },
    input.client,
  )
  if (res.ok) {
    memberNotifications = 1
  } else if (res.error) {
    errors.push(`member_notifications:${res.error}`)
  }

  return { ok: errors.length === 0, memberNotifications, staffNotifications: 0, errors }
}

/** Member receives `kyc_approved` after staff verifies a pending document. */
export async function notifyKycApproved(
  input: NotifyKycReviewInput,
): Promise<NotifyKycResult> {
  const errors: string[] = []
  let memberNotifications = 0

  const tpl = NotificationTemplates.kycApproved(input.docType)
  const res = await notificationService.create(
    {
      institutionId: input.actor.institution_id,
      branchId: input.actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "kyc_approved",
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata: { doc_type: input.docType, member_id: input.member.id },
    },
    input.client,
  )
  if (res.ok) {
    memberNotifications = 1
  } else if (res.error) {
    errors.push(`member_notifications:${res.error}`)
  }

  return { ok: errors.length === 0, memberNotifications, staffNotifications: 0, errors }
}

/** Member receives `kyc_rejected` when staff rejects a pending document. */
export async function notifyKycRejected(
  input: NotifyKycReviewInput,
): Promise<NotifyKycResult> {
  const errors: string[] = []
  let memberNotifications = 0

  const reason = input.reason?.trim() || "Document did not meet requirements"
  const tpl = NotificationTemplates.kycRejected(input.docType, reason)
  const res = await notificationService.create(
    {
      institutionId: input.actor.institution_id,
      branchId: input.actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "kyc_rejected",
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata: { doc_type: input.docType, reason, member_id: input.member.id },
    },
    input.client,
  )
  if (res.ok) {
    memberNotifications = 1
  } else if (res.error) {
    errors.push(`member_notifications:${res.error}`)
  }

  return { ok: errors.length === 0, memberNotifications, staffNotifications: 0, errors }
}
