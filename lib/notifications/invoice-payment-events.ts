import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput, NotificationType } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

const PERMISSIONS = {
  transactions: "view_transactions",
  invoices: "view_invoices",
} as const

export interface InvoicePaymentActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface InvoicePaymentMember {
  id: string
  full_name: string
  member_number: string
}

export interface InvoicePaymentThirdPartyAgent {
  id: string
  name: string
}

export interface InvoicePaymentTransaction {
  id: string
  transaction_number: string
  amount: number
}

export interface InvoicePaymentInvoice {
  id: string
  invoice_number: string
  amount: number
  fullySettled: boolean
  outstanding: number
}

export interface NotifyInvoicePaymentInput {
  client?: PoolClient
  actor: InvoicePaymentActor
  member?: InvoicePaymentMember | null
  thirdPartyAgent?: InvoicePaymentThirdPartyAgent | null
  transaction: InvoicePaymentTransaction
  invoice: InvoicePaymentInvoice
  currency?: string
}

export interface NotifyInvoicePaymentResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications for a manual invoice payment.
 *
 * Member invoice: member receives transaction_recorded + invoice_payment_recorded.
 * Third-party invoice: staff only (transaction + invoice payment).
 */
export async function notifyInvoicePayment(
  input: NotifyInvoicePaymentInput,
): Promise<NotifyInvoicePaymentResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, invoice, transaction } = input
  const currency = input.currency
  const customerName =
    input.member?.full_name ?? input.thirdPartyAgent?.name ?? "customer"

  if (input.member) {
    const memberMessages: CreateNotificationInput[] = []

    const txTpl = NotificationTemplates.transactionRecorded(
      transaction.amount,
      transaction.transaction_number,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "transaction_recorded",
      title: txTpl.title,
      message: txTpl.message,
      actionUrl: txTpl.actionUrl,
      metadata: {
        member_id: input.member.id,
        transaction_id: transaction.id,
        transaction_number: transaction.transaction_number,
        amount: transaction.amount,
      },
    })

    const invTpl = NotificationTemplates.invoicePaymentRecorded(
      invoice.invoice_number,
      invoice.amount,
      invoice.fullySettled,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: input.member.id,
      type: "invoice_payment_recorded",
      title: invTpl.title,
      message: invTpl.message,
      actionUrl: `/client-portal/invoices?invoice_id=${invoice.id}`,
      metadata: {
        member_id: input.member.id,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: invoice.amount,
        fully_settled: invoice.fullySettled,
      },
    })

    const memberRes = await notificationService.createBulk(
      memberMessages,
      input.client,
    )
    if (memberRes.ok) {
      memberNotifications = memberRes.count ?? memberMessages.length
    } else if (memberRes.error) {
      errors.push(`member_notifications:${memberRes.error}`)
    }
  }

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
      errors.push(
        `recipients:${permission}:${(e as Error)?.message || "lookup_failed"}`,
      )
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

  await fanOutToStaff(
    PERMISSIONS.transactions,
    "transaction_recorded",
    input.member
      ? NotificationTemplates.transactionRecordedForStaff(
          customerName,
          transaction.amount,
          transaction.transaction_number,
          input.member.id,
          currency,
        )
      : {
          ...NotificationTemplates.transactionRecordedForStaff(
            customerName,
            transaction.amount,
            transaction.transaction_number,
            "",
            currency,
          ),
          actionUrl: `/invoices?invoice_id=${invoice.id}`,
        },
    {
      member_id: input.member?.id,
      third_party_agent_id: input.thirdPartyAgent?.id,
      transaction_id: transaction.id,
      transaction_number: transaction.transaction_number,
      amount: transaction.amount,
    },
  )

  await fanOutToStaff(
    PERMISSIONS.invoices,
    "invoice_payment_recorded",
    NotificationTemplates.invoicePaymentRecordedForStaff(
      invoice.invoice_number,
      customerName,
      invoice.amount,
      invoice.id,
      invoice.fullySettled,
      currency,
    ),
    {
      member_id: input.member?.id,
      third_party_agent_id: input.thirdPartyAgent?.id,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      amount: invoice.amount,
      fully_settled: invoice.fullySettled,
    },
  )

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}
