import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput, NotificationType } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

/**
 * View permissions controlling which staff are notified per affected module.
 * The fee payment lives under the members module; the transaction and the
 * settled invoice each have their own module permission.
 */
const PERMISSIONS = {
  fee: "view_members",
  transactions: "view_transactions",
  invoices: "view_invoices",
} as const

export interface MembershipFeeActor {
  /** users.id of the staff member that recorded the payment. */
  id: string
  institution_id: string
  branch_id: string
}

export interface MembershipFeeMember {
  id: string
  full_name: string
  member_number: string
}

export interface MembershipFeeSummary {
  amount: number
  /** Outstanding membership fee balance after this payment. */
  remaining: number
}

export interface MembershipFeeTransaction {
  id: string
  transaction_number: string
  amount: number
}

export interface MembershipFeeInvoice {
  id: string
  invoice_number: string
  /** Amount applied to the invoice by this payment. */
  amount: number
  /** Whether the invoice is fully settled after this payment. */
  fullySettled: boolean
}

export interface NotifyMembershipFeeInput {
  client?: PoolClient
  actor: MembershipFeeActor
  member: MembershipFeeMember
  fee: MembershipFeeSummary
  transaction: MembershipFeeTransaction
  invoice?: MembershipFeeInvoice | null
  /** Branch currency code used to format amounts in notifications. */
  currency?: string
}

export interface NotifyMembershipFeeResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications for a membership fee payment.
 *
 * Member (recipient_type='member') receives all of:
 *   - membership_fee_paid
 *   - transaction_recorded
 *   - invoice_payment_recorded (when an open invoice was settled)
 *
 * Staff (recipient_type='institution_user') only receive the notification for a
 * module they can view:
 *   - membership_fee_paid      -> view_members
 *   - transaction_recorded     -> view_transactions
 *   - invoice_payment_recorded -> view_invoices
 *
 * Best-effort: failures are collected into `errors` rather than thrown.
 */
export async function notifyMembershipFeePayment(
  input: NotifyMembershipFeeInput,
): Promise<NotifyMembershipFeeResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, member } = input
  const currency = input.currency

  // ----- Member side: all notifications -----
  const memberMessages: CreateNotificationInput[] = []

  const feeTpl = NotificationTemplates.membershipFeePaid(
    input.fee.amount,
    input.fee.remaining,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: member.id,
    type: "membership_fee_paid",
    title: feeTpl.title,
    message: feeTpl.message,
    actionUrl: feeTpl.actionUrl,
    metadata: {
      member_id: member.id,
      amount: input.fee.amount,
      remaining: input.fee.remaining,
    },
  })

  const txTpl = NotificationTemplates.transactionRecorded(
    input.transaction.amount,
    input.transaction.transaction_number,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: member.id,
    type: "transaction_recorded",
    title: txTpl.title,
    message: txTpl.message,
    actionUrl: txTpl.actionUrl,
    metadata: {
      member_id: member.id,
      transaction_id: input.transaction.id,
      transaction_number: input.transaction.transaction_number,
      amount: input.transaction.amount,
    },
  })

  if (input.invoice) {
    const invTpl = NotificationTemplates.invoicePaymentRecorded(
      input.invoice.invoice_number,
      input.invoice.amount,
      input.invoice.fullySettled,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: member.id,
      type: "invoice_payment_recorded",
      title: invTpl.title,
      message: invTpl.message,
      actionUrl: invTpl.actionUrl,
      metadata: {
        member_id: member.id,
        invoice_id: input.invoice.id,
        invoice_number: input.invoice.invoice_number,
        amount: input.invoice.amount,
        fully_settled: input.invoice.fullySettled,
      },
    })
  }

  const memberRes = await notificationService.createBulk(memberMessages, input.client)
  if (memberRes.ok) {
    memberNotifications = memberRes.count ?? memberMessages.length
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  // ----- Staff side: each event gated by its module's view permission -----
  const fanOutToStaff = async (
    permission: string,
    type: NotificationType,
    tpl: { title: string; message: string; actionUrl?: string },
    metadata: CreateNotificationInput["metadata"],
  ): Promise<void> => {
    if (!input.client) return
    let recipients: AdminRecipient[] = []
    try {
      recipients = await getInstitutionRecipientsWithPermission(
        input.client,
        actor.institution_id,
        permission,
        { excludeUserId: actor.id },
      )
    } catch (e) {
      errors.push(`recipients:${permission}:${(e as Error)?.message || "lookup_failed"}`)
      return
    }
    if (recipients.length === 0) return

    const messages: CreateNotificationInput[] = recipients.map((r) => ({
      institutionId: actor.institution_id,
      branchId: r.branch_id ?? actor.branch_id,
      recipientType: "institution_user",
      recipientId: r.id,
      type,
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata,
    }))

    const res = await notificationService.createBulk(messages, input.client)
    if (res.ok) {
      staffNotifications += res.count ?? messages.length
    } else if (res.error) {
      errors.push(`staff_notifications:${type}:${res.error}`)
    }
  }

  // membership_fee_paid -> view_members
  await fanOutToStaff(
    PERMISSIONS.fee,
    "membership_fee_paid",
    NotificationTemplates.membershipFeePaidForStaff(
      member.full_name,
      input.fee.amount,
      member.id,
      currency,
    ),
    {
      member_id: member.id,
      amount: input.fee.amount,
      remaining: input.fee.remaining,
    },
  )

  // transaction_recorded -> view_transactions
  await fanOutToStaff(
    PERMISSIONS.transactions,
    "transaction_recorded",
    NotificationTemplates.transactionRecordedForStaff(
      member.full_name,
      input.transaction.amount,
      input.transaction.transaction_number,
      member.id,
      currency,
    ),
    {
      member_id: member.id,
      transaction_id: input.transaction.id,
      transaction_number: input.transaction.transaction_number,
      amount: input.transaction.amount,
    },
  )

  // invoice_payment_recorded -> view_invoices
  if (input.invoice) {
    await fanOutToStaff(
      PERMISSIONS.invoices,
      "invoice_payment_recorded",
      NotificationTemplates.invoicePaymentRecordedForStaff(
        input.invoice.invoice_number,
        member.full_name,
        input.invoice.amount,
        input.invoice.id,
        input.invoice.fullySettled,
        currency,
      ),
      {
        member_id: member.id,
        invoice_id: input.invoice.id,
        invoice_number: input.invoice.invoice_number,
        amount: input.invoice.amount,
        fully_settled: input.invoice.fullySettled,
      },
    )
  }

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}
