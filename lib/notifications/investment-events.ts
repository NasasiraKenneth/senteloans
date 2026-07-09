import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

const PERMISSIONS = {
  viewInvestments: "view_investments",
} as const

export interface InvestmentActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface InvestmentCreatedSummary {
  id: string
  investment_name?: string | null
  investment_number?: string | null
  initial_amount: number
  category?: string | null
  provider_id?: string | null
  provider_name?: string | null
  status?: string | null
}

export interface NotifyInvestmentCreatedInput {
  client?: PoolClient
  actor: InvestmentActor
  investment: InvestmentCreatedSummary
  currency?: string
}

export interface NotifyInvestmentCreatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

function investmentDisplayName(investment: {
  investment_name?: string | null
  investment_number?: string | null
  id: string
}): string {
  const name = investment.investment_name?.trim()
  if (name) return name
  const number = investment.investment_number?.trim()
  if (number) return number
  return "Investment"
}

/**
 * Notify institution staff who can view investments when a new investment is
 * created. The creating staff member (actor) is excluded from recipients.
 */
export async function notifyInvestmentCreated(
  input: NotifyInvestmentCreatedInput,
): Promise<NotifyInvestmentCreatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, investment } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewInvestments,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const label = investmentDisplayName(investment)
  const tpl = NotificationTemplates.investmentCreatedForStaff(
    label,
    investment.initial_amount,
    investment.id,
    investment.investment_number,
    input.currency,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    investment_id: investment.id,
    investment_number: investment.investment_number ?? undefined,
    investment_name: investment.investment_name ?? undefined,
    amount: investment.initial_amount,
    category: investment.category ?? undefined,
    provider_id: investment.provider_id ?? undefined,
    provider_name: investment.provider_name ?? undefined,
    status: investment.status ?? "pending",
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "investment_created",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:investment_created:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface InvestmentDevelopmentStartedSummary {
  id: string
  investment_name?: string | null
  investment_number?: string | null
  principal_amount: number
  start_date: string
  maturity_date: string
}

export interface NotifyInvestmentDevelopmentStartedInput {
  client?: PoolClient
  actor: InvestmentActor
  investment: InvestmentDevelopmentStartedSummary
  currency?: string
}

export interface NotifyInvestmentDevelopmentStartedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view investments when development starts
 * (approved → under_development). The activating staff member is excluded.
 */
export async function notifyInvestmentDevelopmentStarted(
  input: NotifyInvestmentDevelopmentStartedInput,
): Promise<NotifyInvestmentDevelopmentStartedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, investment } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewInvestments,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const label = investmentDisplayName(investment)
  const tpl = NotificationTemplates.investmentDevelopmentStartedForStaff(
    label,
    investment.principal_amount,
    investment.id,
    investment.start_date,
    investment.maturity_date,
    input.currency,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    investment_id: investment.id,
    investment_number: investment.investment_number ?? undefined,
    investment_name: investment.investment_name ?? undefined,
    amount: investment.principal_amount,
    start_date: investment.start_date,
    maturity_date: investment.maturity_date,
    status: "under_development",
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "investment_development_started",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:investment_development_started:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface InvestmentCashflowRecordedSummary {
  id: string
  type: string
  category: string
  amount: number
  date: string
}

export interface InvestmentCashflowInvestmentSummary {
  id: string
  investment_name?: string | null
  investment_number?: string | null
}

export interface InvestmentCashflowValuationSummary {
  opening_value: number
  closing_value: number
}

export interface NotifyInvestmentCashflowRecordedInput {
  client?: PoolClient
  actor: InvestmentActor
  investment: InvestmentCashflowInvestmentSummary
  cashflow: InvestmentCashflowRecordedSummary
  valuation: InvestmentCashflowValuationSummary
  transactionId?: string | null
  currency?: string
}

export interface NotifyInvestmentCashflowRecordedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view investments when a cashflow is recorded.
 * The recording staff member (actor) is excluded.
 */
export async function notifyInvestmentCashflowRecorded(
  input: NotifyInvestmentCashflowRecordedInput,
): Promise<NotifyInvestmentCashflowRecordedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, investment, cashflow, valuation } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewInvestments,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const label = investmentDisplayName(investment)
  const tpl = NotificationTemplates.investmentCashflowRecordedForStaff(
    label,
    cashflow.type,
    cashflow.category,
    cashflow.amount,
    investment.id,
    valuation.closing_value,
    investment.investment_number,
    input.currency,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    investment_id: investment.id,
    investment_number: investment.investment_number ?? undefined,
    investment_name: investment.investment_name ?? undefined,
    cashflow_id: cashflow.id,
    type: cashflow.type,
    category: cashflow.category,
    amount: cashflow.amount,
    date: cashflow.date,
    opening_value: valuation.opening_value,
    closing_value: valuation.closing_value,
    transaction_id: input.transactionId ?? undefined,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "investment_cashflow_recorded",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:investment_cashflow_recorded:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}
