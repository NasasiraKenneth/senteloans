import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

const PERMISSIONS = {
  viewSaccoLoans: "view_sacco_loans",
} as const

export interface SaccoLoanActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface SaccoLoanThirdPartyAgent {
  id: string
  name: string
}

export interface SaccoLoanCreatedSummary {
  id: string
  principal_amount: number
  loan_product?: string | null
  loan_type?: string | null
}

export interface NotifySaccoLoanCreatedInput {
  client?: PoolClient
  actor: SaccoLoanActor
  agent: SaccoLoanThirdPartyAgent
  loan: SaccoLoanCreatedSummary
  currency?: string
}

export interface NotifySaccoLoanCreatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view external/sacco loans when a new loan is
 * created. The creating staff member (actor) is excluded from recipients.
 */
export async function notifySaccoLoanCreated(
  input: NotifySaccoLoanCreatedInput,
): Promise<NotifySaccoLoanCreatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, agent, loan } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewSaccoLoans,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const tpl = NotificationTemplates.saccoLoanCreatedForStaff(
    agent.name,
    loan.principal_amount,
    loan.id,
    loan.loan_product,
    input.currency,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    sacco_loan_id: loan.id,
    third_party_agent_id: agent.id,
    third_party_agent_name: agent.name,
    amount: loan.principal_amount,
    loan_type: loan.loan_type ?? undefined,
    product_name: loan.loan_product ?? undefined,
    status: "Applied",
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "sacco_loan_created",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:sacco_loan_created:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface SaccoLoanActivatedSummary {
  id: string
  loan_product?: string | null
  next_payment_date: string
  maturity_date: string
  monthly_payment: number
}

export interface NotifySaccoLoanActivatedInput {
  client?: PoolClient
  actor: SaccoLoanActor
  agent: SaccoLoanThirdPartyAgent
  loan: SaccoLoanActivatedSummary
}

export interface NotifySaccoLoanActivatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view external/sacco loans when a loan is
 * activated for repayment. The activating staff member (actor) is excluded.
 */
export async function notifySaccoLoanActivated(
  input: NotifySaccoLoanActivatedInput,
): Promise<NotifySaccoLoanActivatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, agent, loan } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewSaccoLoans,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const tpl = NotificationTemplates.saccoLoanActivatedForStaff(
    agent.name,
    loan.id,
    loan.loan_product,
    loan.next_payment_date,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    sacco_loan_id: loan.id,
    third_party_agent_id: agent.id,
    third_party_agent_name: agent.name,
    product_name: loan.loan_product ?? undefined,
    status: "Active",
    next_payment_date: loan.next_payment_date,
    maturity_date: loan.maturity_date,
    monthly_payment: loan.monthly_payment,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "sacco_loan_activated",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:sacco_loan_activated:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface SaccoLoanPaymentRecordedSummary {
  id: string
  loan_product?: string | null
}

export interface SaccoLoanPaymentSummary {
  amount: number
  balance_after: number
  payment_date: string
  status: string
}

export interface SaccoLoanPaymentTransactionSummary {
  id: string
  transaction_number: string
}

export interface NotifySaccoLoanPaymentRecordedInput {
  client?: PoolClient
  actor: SaccoLoanActor
  agent: SaccoLoanThirdPartyAgent
  loan: SaccoLoanPaymentRecordedSummary
  payment: SaccoLoanPaymentSummary
  transaction: SaccoLoanPaymentTransactionSummary
  currency?: string
}

export interface NotifySaccoLoanPaymentRecordedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view external/sacco loans when a repayment is
 * recorded. The recording staff member (actor) is excluded.
 */
export async function notifySaccoLoanPaymentRecorded(
  input: NotifySaccoLoanPaymentRecordedInput,
): Promise<NotifySaccoLoanPaymentRecordedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, agent, loan, payment, transaction } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewSaccoLoans,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const isClosed = String(payment.status || "") === "Closed"
  const tpl = NotificationTemplates.saccoLoanPaymentRecordedForStaff(
    agent.name,
    payment.amount,
    loan.id,
    payment.balance_after,
    loan.loan_product,
    isClosed,
    input.currency,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    sacco_loan_id: loan.id,
    third_party_agent_id: agent.id,
    third_party_agent_name: agent.name,
    product_name: loan.loan_product ?? undefined,
    amount: payment.amount,
    balance_after: payment.balance_after,
    payment_date: payment.payment_date,
    status: payment.status,
    transaction_id: transaction.id,
    transaction_number: transaction.transaction_number,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "sacco_loan_payment_recorded",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:sacco_loan_payment_recorded:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}
