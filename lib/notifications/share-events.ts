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
 * Shares live under the members module; the transaction + invoice each have
 * their own module permission.
 */
const PERMISSIONS = {
  shares: "view_members",
  transactions: "view_transactions",
  invoices: "view_invoices",
} as const

export interface SharePurchaseActor {
  /** users.id of the staff member that recorded the purchase. */
  id: string
  institution_id: string
  branch_id: string
}

export interface SharePurchaseMember {
  id: string
  full_name: string
  member_number: string
}

export interface SharePurchaseSummary {
  numberOfShares: number
  totalValue: number
}

export interface SharePurchaseTransaction {
  id: string
  transaction_number: string
  amount: number
}

export interface SharePurchaseInvoice {
  id: string
  invoice_number: string
  total_amount: number
}

export interface NotifySharePurchaseInput {
  client?: PoolClient
  actor: SharePurchaseActor
  member: SharePurchaseMember
  shares: SharePurchaseSummary
  transaction: SharePurchaseTransaction
  invoice?: SharePurchaseInvoice | null
  /** Branch currency code used to format amounts in notifications. */
  currency?: string
}

export interface NotifySharePurchaseResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications for a share purchase.
 *
 * Member (recipient_type='member') receives all three:
 *   - shares_purchased
 *   - transaction_recorded
 *   - invoice_created (when an invoice exists)
 *
 * Staff (recipient_type='institution_user') only receive the notification for a
 * module they can view:
 *   - shares_purchased   -> view_members
 *   - transaction_recorded -> view_transactions
 *   - invoice_created    -> view_invoices
 *
 * Best-effort: failures are collected into `errors` rather than thrown.
 */
export async function notifySharePurchase(
  input: NotifySharePurchaseInput,
): Promise<NotifySharePurchaseResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, member } = input
  const currency = input.currency

  // ----- Member side: all three notifications -----
  const memberMessages: CreateNotificationInput[] = []

  const sharesTpl = NotificationTemplates.sharesPurchased(
    input.shares.numberOfShares,
    input.shares.totalValue,
    input.invoice?.invoice_number ?? null,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: member.id,
    type: "shares_purchased",
    title: sharesTpl.title,
    message: sharesTpl.message,
    actionUrl: sharesTpl.actionUrl,
    metadata: {
      member_id: member.id,
      number_of_shares: input.shares.numberOfShares,
      amount: input.shares.totalValue,
      invoice_id: input.invoice?.id,
      invoice_number: input.invoice?.invoice_number,
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
    const invTpl = NotificationTemplates.invoiceCreated(
      input.invoice.invoice_number,
      input.invoice.total_amount,
      input.invoice.id,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: member.id,
      type: "invoice_created",
      title: invTpl.title,
      message: invTpl.message,
      actionUrl: invTpl.actionUrl,
      metadata: {
        member_id: member.id,
        invoice_id: input.invoice.id,
        invoice_number: input.invoice.invoice_number,
        amount: input.invoice.total_amount,
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

  // shares_purchased -> view_members
  await fanOutToStaff(
    PERMISSIONS.shares,
    "shares_purchased",
    NotificationTemplates.sharesPurchasedForStaff(
      member.full_name,
      input.shares.numberOfShares,
      input.shares.totalValue,
      member.id,
      currency,
    ),
    {
      member_id: member.id,
      number_of_shares: input.shares.numberOfShares,
      amount: input.shares.totalValue,
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

  // invoice_created -> view_invoices
  if (input.invoice) {
    await fanOutToStaff(
      PERMISSIONS.invoices,
      "invoice_created",
      NotificationTemplates.invoiceCreatedForStaff(
        input.invoice.invoice_number,
        member.full_name,
        input.invoice.total_amount,
        input.invoice.id,
        currency,
      ),
      {
        member_id: member.id,
        invoice_id: input.invoice.id,
        invoice_number: input.invoice.invoice_number,
        amount: input.invoice.total_amount,
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
