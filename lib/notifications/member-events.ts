import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import { getInstitutionAdminRecipients, getInstitutionRecipientsWithPermission } from "./admin-recipients"

export interface MemberRegistrationActor {
  /** users.id of the staff member that performed the registration. */
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

  // Staff side — new-member registration is intentionally an
  // institution-wide announcement, so every Active staff member (regardless
  // of role) gets the alert, except the actor who just performed the
  // registration. Future role-/permission-scoped events should keep using
  // the default `getInstitutionAdminRecipients` filter.
  let recipients: { id: string; branch_id: string | null }[] = []
  if (input.client) {
    try {
      recipients = await getInstitutionAdminRecipients(
        input.client,
        input.actor.institution_id,
        { excludeUserId: input.actor.id, includeAllRoles: true },
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

export interface MemberProfileUpdateActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface MemberProfileUpdateSummary {
  id: string
  full_name: string
  member_number: string
}

export interface NotifyMemberProfileUpdatedInput {
  client?: PoolClient
  actor: MemberProfileUpdateActor
  member: MemberProfileUpdateSummary
  /** DB column names that changed (excluding modified_by). */
  updatedFields?: string[]
  institutionName?: string
}

export interface NotifyMemberProfileUpdatedResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications when staff updates a member profile.
 *
 * Member receives `profile_updated`. Staff with `view_members` (excluding the
 * actor) receive `member_profile_updated`.
 */
export async function notifyMemberProfileUpdated(
  input: NotifyMemberProfileUpdatedInput,
): Promise<NotifyMemberProfileUpdatedResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const memberTpl = NotificationTemplates.profileUpdated(input.institutionName)
  const memberRes = await notificationService.create(
    {
      institutionId: input.actor.institution_id,
      branchId: input.actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "profile_updated",
      title: memberTpl.title,
      message: memberTpl.message,
      actionUrl: memberTpl.actionUrl,
      metadata: {
        member_id: input.member.id,
        member_number: input.member.member_number,
        updated_fields: input.updatedFields,
      },
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
        input.actor.institution_id,
        "view_members",
        { excludeUserId: input.actor.id },
      )
    } catch (e) {
      errors.push(`recipients:view_members:${(e as Error)?.message || "lookup_failed"}`)
    }

    if (recipients.length > 0) {
      const staffTpl = NotificationTemplates.memberProfileUpdatedForStaff(
        input.member.full_name,
        input.member.member_number,
        input.member.id,
      )
      const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
        institutionId: input.actor.institution_id,
        branchId: r.branch_id ?? input.actor.branch_id,
        recipientType: "institution_user",
        recipientId: r.id,
        type: "member_profile_updated",
        title: staffTpl.title,
        message: staffTpl.message,
        actionUrl: staffTpl.actionUrl,
        metadata: {
          member_id: input.member.id,
          member_number: input.member.member_number,
          updated_fields: input.updatedFields,
        },
      }))
      const staffRes = await notificationService.createBulk(staffMessages, input.client)
      if (staffRes.ok) {
        staffNotifications = staffRes.count ?? staffMessages.length
      } else if (staffRes.error) {
        errors.push(`staff_notifications:member_profile_updated:${staffRes.error}`)
      }
    }
  }

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}

export interface MemberPortalLoginActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface MemberPortalLoginSummary {
  id: string
  full_name: string
  member_number: string
}

export interface NotifyMemberPortalLoginInput {
  client?: PoolClient
  actor: MemberPortalLoginActor
  member: MemberPortalLoginSummary
  institutionName?: string
  /** True when the member already had portal auth and only the password was reset. */
  passwordReset?: boolean
}

export interface NotifyMemberPortalLoginResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications when staff enables or resets member portal login.
 *
 * Member receives a welcome / password-reset notice (no password in the message).
 * Staff with `edit_member` (excluding the actor) receive `member_login_enabled`.
 */
export async function notifyMemberPortalLoginEnabled(
  input: NotifyMemberPortalLoginInput,
): Promise<NotifyMemberPortalLoginResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0
  const passwordReset = Boolean(input.passwordReset)

  const memberTpl = passwordReset
    ? NotificationTemplates.memberPortalPasswordReset()
    : NotificationTemplates.memberPortalAccessEnabled(
        input.member.full_name,
        input.institutionName,
      )

  const memberRes = await notificationService.create(
    {
      institutionId: input.actor.institution_id,
      branchId: input.actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "member_portal_access_enabled",
      title: memberTpl.title,
      message: memberTpl.message,
      actionUrl: memberTpl.actionUrl,
      metadata: {
        member_id: input.member.id,
        member_number: input.member.member_number,
        reason: passwordReset ? "password_reset" : "login_enabled",
      },
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
        input.actor.institution_id,
        "edit_member",
        { excludeUserId: input.actor.id },
      )
      recipients = recipients.filter(
        (r) => !r.branch_id || r.branch_id === input.actor.branch_id,
      )
    } catch (e) {
      errors.push(`recipients:edit_member:${(e as Error)?.message || "lookup_failed"}`)
    }

    if (recipients.length > 0) {
      const staffTpl = NotificationTemplates.memberLoginEnabledForStaff(
        input.member.full_name,
        input.member.member_number,
        input.member.id,
        passwordReset,
      )
      const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
        institutionId: input.actor.institution_id,
        branchId: r.branch_id ?? input.actor.branch_id,
        recipientType: "institution_user",
        recipientId: r.id,
        type: "member_login_enabled",
        title: staffTpl.title,
        message: staffTpl.message,
        actionUrl: staffTpl.actionUrl,
        metadata: {
          member_id: input.member.id,
          member_name: input.member.full_name,
          member_number: input.member.member_number,
          reason: passwordReset ? "password_reset" : "login_enabled",
        },
      }))
      const staffRes = await notificationService.createBulk(staffMessages, input.client)
      if (staffRes.ok) {
        staffNotifications = staffRes.count ?? staffMessages.length
      } else if (staffRes.error) {
        errors.push(`staff_notifications:member_login_enabled:${staffRes.error}`)
      }
    }
  }

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}
