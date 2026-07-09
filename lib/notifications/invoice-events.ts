import type { PoolClient } from "pg"
import { normalizeInvoiceStatus } from "@/lib/invoices/status"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput, NotificationType } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

const INVOICES_PERMISSION = "view_invoices"

export interface InvoiceCreatedActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface InvoiceCreatedMember {
  id: string
  full_name: string
  member_number: string
}

export interface InvoiceCreatedThirdPartyAgent {
  id: string
  name: string
}

export interface InvoiceCreatedSummary {
  id: string
  invoice_number: string
  total_amount: number
  invoice_due?: string | null
  status: string
}

export interface NotifyInvoiceCreatedInput {
  client?: PoolClient
  actor: InvoiceCreatedActor
  invoice: InvoiceCreatedSummary
  member?: InvoiceCreatedMember | null
  thirdPartyAgent?: InvoiceCreatedThirdPartyAgent | null
  currency?: string
}

export interface NotifyInvoiceCreatedResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications when a staff user creates an invoice.
 *
 * - draft (any target): staff only (`invoice_draft_created`, view_invoices)
 * - sent + member: staff (`invoice_created`) + member (`invoice_created`)
 * - sent + third party: staff only (`invoice_created`)
 */
export async function notifyInvoiceCreated(
  input: NotifyInvoiceCreatedInput,
): Promise<NotifyInvoiceCreatedResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, invoice } = input
  const currency = input.currency
  const status = normalizeInvoiceStatus(invoice.status)
  const recipientName =
    input.member?.full_name ?? input.thirdPartyAgent?.name ?? "customer"

  if (status === "sent" && input.member) {
    const tpl = NotificationTemplates.invoiceCreated(
      invoice.invoice_number,
      invoice.total_amount,
      invoice.id,
      currency,
    )
    const memberMessages: CreateNotificationInput[] = [
      {
        institutionId: actor.institution_id,
        branchId: actor.branch_id,
        recipientType: "member",
        recipientId: input.member.id,
        type: "invoice_created",
        title: tpl.title,
        message: tpl.message,
        actionUrl: invoice.id
          ? `/client-portal/invoices?invoice_id=${invoice.id}`
          : tpl.actionUrl,
        metadata: {
          member_id: input.member.id,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: invoice.total_amount,
          status,
        },
      },
    ]

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

  if (status === "draft" || status === "sent") {
    const staffType: NotificationType =
      status === "draft" ? "invoice_draft_created" : "invoice_created"
    const staffTpl =
      status === "draft"
        ? NotificationTemplates.invoiceDraftCreatedForStaff(
            invoice.invoice_number,
            recipientName,
            invoice.total_amount,
            invoice.id,
            currency,
          )
        : NotificationTemplates.invoiceCreatedForStaff(
            invoice.invoice_number,
            recipientName,
            invoice.total_amount,
            invoice.id,
            currency,
          )

    if (input.client) {
      let recipients: AdminRecipient[] = []
      try {
        recipients = await getInstitutionRecipientsWithPermission(
          input.client,
          actor.institution_id,
          INVOICES_PERMISSION,
          { excludeUserId: actor.id },
        )
      } catch (e) {
        errors.push(
          `recipients:${INVOICES_PERMISSION}:${(e as Error)?.message || "lookup_failed"}`,
        )
      }

      if (recipients.length > 0) {
        const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
          institutionId: actor.institution_id,
          branchId: r.branch_id ?? actor.branch_id,
          recipientType: "institution_user",
          recipientId: r.id,
          type: staffType,
          title: staffTpl.title,
          message: staffTpl.message,
          actionUrl: staffTpl.actionUrl,
          metadata: {
            member_id: input.member?.id,
            third_party_agent_id: input.thirdPartyAgent?.id,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            amount: invoice.total_amount,
            status,
          },
        }))

        const staffRes = await notificationService.createBulk(
          staffMessages,
          input.client,
        )
        if (staffRes.ok) {
          staffNotifications = staffRes.count ?? staffMessages.length
        } else if (staffRes.error) {
          errors.push(`staff_notifications:${staffType}:${staffRes.error}`)
        }
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

export type InvoiceStatusNotificationTarget = "cancelled" | "overdue"

export interface NotifyInvoiceStatusChangeInput {
  client?: PoolClient
  actor: InvoiceCreatedActor
  invoice: Omit<InvoiceCreatedSummary, "status">
  statusTarget: InvoiceStatusNotificationTarget
  member?: InvoiceCreatedMember | null
  thirdPartyAgent?: InvoiceCreatedThirdPartyAgent | null
}

/**
 * Fan out in-app notifications when an invoice is cancelled or marked overdue.
 *
 * - cancelled / overdue + member: staff + member
 * - cancelled / overdue + third party: staff only
 */
export async function notifyInvoiceStatusChange(
  input: NotifyInvoiceStatusChangeInput,
): Promise<NotifyInvoiceCreatedResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, invoice, statusTarget } = input
  const recipientName =
    input.member?.full_name ?? input.thirdPartyAgent?.name ?? "customer"
  const staffType: NotificationType =
    statusTarget === "cancelled" ? "invoice_cancelled" : "invoice_overdue"
  const memberType = staffType

  const memberTpl =
    statusTarget === "cancelled"
      ? NotificationTemplates.invoiceCancelled(invoice.invoice_number, invoice.id)
      : NotificationTemplates.invoiceOverdue(invoice.invoice_number, invoice.id)
  const staffTpl =
    statusTarget === "cancelled"
      ? NotificationTemplates.invoiceCancelledForStaff(
          invoice.invoice_number,
          recipientName,
          invoice.id,
        )
      : NotificationTemplates.invoiceOverdueForStaff(
          invoice.invoice_number,
          recipientName,
          invoice.id,
        )

  if (input.member) {
    const memberMessages: CreateNotificationInput[] = [
      {
        institutionId: actor.institution_id,
        branchId: actor.branch_id,
        recipientType: "member",
        recipientId: input.member.id,
        type: memberType,
        title: memberTpl.title,
        message: memberTpl.message,
        actionUrl: memberTpl.actionUrl,
        metadata: {
          member_id: input.member.id,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: invoice.total_amount,
          status: statusTarget,
        },
      },
    ]

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

  if (input.client) {
    let recipients: AdminRecipient[] = []
    try {
      recipients = await getInstitutionRecipientsWithPermission(
        input.client,
        actor.institution_id,
        INVOICES_PERMISSION,
        { excludeUserId: actor.id },
      )
    } catch (e) {
      errors.push(
        `recipients:${INVOICES_PERMISSION}:${(e as Error)?.message || "lookup_failed"}`,
      )
    }

    if (recipients.length > 0) {
      const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
        institutionId: actor.institution_id,
        branchId: r.branch_id ?? actor.branch_id,
        recipientType: "institution_user",
        recipientId: r.id,
        type: staffType,
        title: staffTpl.title,
        message: staffTpl.message,
        actionUrl: staffTpl.actionUrl,
        metadata: {
          member_id: input.member?.id,
          third_party_agent_id: input.thirdPartyAgent?.id,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: invoice.total_amount,
          status: statusTarget,
        },
      }))

      const staffRes = await notificationService.createBulk(
        staffMessages,
        input.client,
      )
      if (staffRes.ok) {
        staffNotifications = staffRes.count ?? staffMessages.length
      } else if (staffRes.error) {
        errors.push(`staff_notifications:${staffType}:${staffRes.error}`)
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
