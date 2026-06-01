import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import { getInstitutionAdminRecipients } from "./admin-recipients"

export interface MemberRegistrationActor {
  /** senteloans_users.id of the staff member that performed the registration. */
  id: string
  institution_id: string
  branch_id: string
}

export interface RegisteredMemberSummary {
  id: string
  full_name: string
  member_number: string
}

export interface InvoiceSummary {
  id: string
  invoice_number: string
  total_amount: number
  invoice_due?: string | null
}

export interface NotifyMemberRegistrationInput {
  client?: PoolClient
  actor: MemberRegistrationActor
  member: RegisteredMemberSummary
  institutionName?: string
  /** When present, an additional invoice-created notification is emitted to
   *  both the member and admin staff. */
  invoice?: InvoiceSummary | null
}

export interface NotifyMemberRegistrationResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out the standard set of in-app notifications produced when a brand new
 * member is registered:
 *
 *  Member side (recipient_type='member'):
 *    - member_welcome
 *    - kyc_verification_required
 *    - membership_invoice_created (only when an invoice was created)
 *
 *  Staff side (recipient_type='institution_user', excluding the actor):
 *    - new_member_registered
 *    - new invoice-created notification (only when an invoice was created)
 *
 * All inserts are best-effort: failures are collected into `errors` instead of
 * thrown, so the caller can decide whether to surface them. This keeps the
 * member-creation API path resilient even if notifications fail.
 */
export async function notifyMemberRegistration(
  input: NotifyMemberRegistrationInput,
): Promise<NotifyMemberRegistrationResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const memberMessages: CreateNotificationInput[] = []

  const welcome = NotificationTemplates.memberWelcome(
    input.member.full_name,
    input.institutionName,
  )
  memberMessages.push({
    institutionId: input.actor.institution_id,
    branchId: input.actor.branch_id,
    recipientType: "member",
    recipientId: input.member.id,
    type: "member_welcome",
    title: welcome.title,
    message: welcome.message,
    actionUrl: welcome.actionUrl,
    metadata: {
      member_id: input.member.id,
      member_number: input.member.member_number,
    },
  })

  const kyc = NotificationTemplates.kycVerificationRequired()
  memberMessages.push({
    institutionId: input.actor.institution_id,
    branchId: input.actor.branch_id,
    recipientType: "member",
    recipientId: input.member.id,
    type: "kyc_verification_required",
    title: kyc.title,
    message: kyc.message,
    actionUrl: kyc.actionUrl,
    metadata: { member_id: input.member.id },
  })

  if (input.invoice) {
    const tpl = NotificationTemplates.membershipInvoiceCreated(
      input.invoice.invoice_number,
      input.invoice.total_amount,
      input.invoice.id,
      input.invoice.invoice_due ?? null,
    )
    memberMessages.push({
      institutionId: input.actor.institution_id,
      branchId: input.actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "membership_invoice_created",
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata: {
        member_id: input.member.id,
        invoice_id: input.invoice.id,
        invoice_number: input.invoice.invoice_number,
        amount: input.invoice.total_amount,
        due_date: input.invoice.invoice_due ?? undefined,
      },
    })
  }

  const memberRes = await notificationService.createBulk(memberMessages, input.client)
  if (memberRes.ok) {
    memberNotifications = memberRes.count ?? memberMessages.length
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  // Staff side - look up branch-scoped admin recipients, excluding the actor.
  let recipients: { id: string; branch_id: string | null }[] = []
  if (input.client) {
    try {
      recipients = await getInstitutionAdminRecipients(
        input.client,
        input.actor.institution_id,
        { excludeUserId: input.actor.id },
      )
    } catch (e) {
      errors.push(
        `admin_recipients:${(e as Error)?.message || "lookup_failed"}`,
      )
    }
  }

  if (recipients.length > 0) {
    const staffMessages: CreateNotificationInput[] = []
    const newMember = NotificationTemplates.newMemberRegistered(
      input.member.full_name,
      input.member.member_number,
      input.member.id,
    )
    for (const r of recipients) {
      staffMessages.push({
        institutionId: input.actor.institution_id,
        branchId: r.branch_id ?? input.actor.branch_id,
        recipientType: "institution_user",
        recipientId: r.id,
        type: "new_member_registered",
        title: newMember.title,
        message: newMember.message,
        actionUrl: newMember.actionUrl,
        metadata: {
          member_id: input.member.id,
          member_number: input.member.member_number,
        },
      })
    }

    if (input.invoice) {
      const invTpl = NotificationTemplates.newInvoiceCreatedForStaff(
        input.invoice.invoice_number,
        input.member.full_name,
        input.invoice.total_amount,
        input.invoice.id,
      )
      for (const r of recipients) {
        staffMessages.push({
          institutionId: input.actor.institution_id,
          branchId: r.branch_id ?? input.actor.branch_id,
          recipientType: "institution_user",
          recipientId: r.id,
          type: "membership_invoice_created",
          title: invTpl.title,
          message: invTpl.message,
          actionUrl: invTpl.actionUrl,
          metadata: {
            member_id: input.member.id,
            invoice_id: input.invoice.id,
            invoice_number: input.invoice.invoice_number,
            amount: input.invoice.total_amount,
          },
        })
      }
    }

    const staffRes = await notificationService.createBulk(staffMessages, input.client)
    if (staffRes.ok) {
      staffNotifications = staffRes.count ?? staffMessages.length
    } else if (staffRes.error) {
      errors.push(`staff_notifications:${staffRes.error}`)
    }
  }

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}
