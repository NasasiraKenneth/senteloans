import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

const PERMISSIONS = {
  viewExpenses: "view_expenses",
} as const

export interface ExpenseActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface ExpenseCreatedSummary {
  id: string
  name?: string | null
  expense_number?: string | null
  type?: string | null
  status?: string | null
}

export interface NotifyExpenseCreatedInput {
  client?: PoolClient
  actor: ExpenseActor
  expense: ExpenseCreatedSummary
}

export interface NotifyExpenseCreatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

function expenseDisplayName(expense: {
  name?: string | null
  expense_number?: string | null
  id: string
}): string {
  const name = expense.name?.trim()
  if (name) return name
  const number = expense.expense_number?.trim()
  if (number) return number
  return "Expense"
}

/**
 * Notify institution staff who can view expenses when a new expense is created.
 * The creating staff member (actor) is excluded from recipients.
 */
export async function notifyExpenseCreated(
  input: NotifyExpenseCreatedInput,
): Promise<NotifyExpenseCreatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, expense } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewExpenses,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const label = expenseDisplayName(expense)
  const tpl = NotificationTemplates.expenseCreatedForStaff(
    label,
    expense.id,
    expense.expense_number,
    expense.type,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    expense_id: expense.id,
    expense_number: expense.expense_number ?? undefined,
    expense_name: expense.name ?? undefined,
    type: expense.type ?? undefined,
    status: expense.status ?? "Pending",
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "expense_created",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:expense_created:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface ExpenseUpdatedSummary {
  id: string
  name?: string | null
  expense_number?: string | null
  type?: string | null
  status?: string | null
}

export interface NotifyExpenseUpdatedInput {
  client?: PoolClient
  actor: ExpenseActor
  expense: ExpenseUpdatedSummary
}

export interface NotifyExpenseUpdatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view expenses when an expense is edited.
 * The editing staff member (actor) is excluded from recipients.
 */
export async function notifyExpenseUpdated(
  input: NotifyExpenseUpdatedInput,
): Promise<NotifyExpenseUpdatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, expense } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewExpenses,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const label = expenseDisplayName(expense)
  const tpl = NotificationTemplates.expenseUpdatedForStaff(
    label,
    expense.id,
    expense.expense_number,
    expense.type,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    expense_id: expense.id,
    expense_number: expense.expense_number ?? undefined,
    expense_name: expense.name ?? undefined,
    type: expense.type ?? undefined,
    status: expense.status ?? undefined,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "expense_updated",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:expense_updated:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface ExpenseCashflowPaymentRecordedSummary {
  id: string
  amount: number
  status: string
  outstanding: number
}

export interface ExpenseCashflowPaymentTransactionSummary {
  id: string
  transaction_number: string
  amount: number
}

export interface NotifyExpenseCashflowPaymentRecordedInput {
  client?: PoolClient
  actor: ExpenseActor
  expense: ExpenseCreatedSummary
  cashflow: ExpenseCashflowPaymentRecordedSummary
  assigneeName: string
  transaction: ExpenseCashflowPaymentTransactionSummary
  currency?: string
}

export interface NotifyExpenseCashflowPaymentRecordedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view expenses when a cashflow payment is recorded.
 * The recording staff member (actor) is excluded from recipients.
 */
export async function notifyExpenseCashflowPaymentRecorded(
  input: NotifyExpenseCashflowPaymentRecordedInput,
): Promise<NotifyExpenseCashflowPaymentRecordedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, expense, cashflow, transaction, assigneeName } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewExpenses,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const fullyPaid =
    cashflow.outstanding <= 0.01 ||
    String(cashflow.status || "")
      .trim()
      .toLowerCase() === "fully paid"
  const label = expenseDisplayName(expense)
  const tpl = NotificationTemplates.expenseCashflowPaymentRecordedForStaff(
    assigneeName,
    transaction.amount,
    expense.id,
    label,
    expense.expense_number,
    fullyPaid,
    cashflow.outstanding,
    input.currency,
  )
  const metadata: CreateNotificationInput["metadata"] = {
    expense_id: expense.id,
    expense_number: expense.expense_number ?? undefined,
    expense_name: expense.name ?? undefined,
    expense_cashflow_id: cashflow.id,
    amount: transaction.amount,
    outstanding: cashflow.outstanding,
    fully_paid: fullyPaid,
    cashflow_status: cashflow.status,
    transaction_id: transaction.id,
    transaction_number: transaction.transaction_number,
    assignee_name: assigneeName,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "expense_cashflow_payment_recorded",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:expense_cashflow_payment_recorded:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}
