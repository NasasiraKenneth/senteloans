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
} as const

export type SavingsTransactionType = "Deposit" | "Withdrawal" | "Transfer"

export interface SavingsTransactionActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface SavingsTransactionMember {
  id: string
  full_name: string
  member_number: string
}

export interface SavingsTransactionAccount {
  id: string
  account_number: string
}

export interface SavingsTransactionSummary {
  id: string
  transaction_number: string
  amount: number
  balance_after: number
  type: SavingsTransactionType
  mode: string
  charges?: number | null
}

export interface SavingsTransferDestination {
  member: SavingsTransactionMember
  account: SavingsTransactionAccount
  transaction: {
    id: string
    transaction_number: string
    amount: number
    balance_after: number
  }
}

export interface NotifySavingsTransactionInput {
  client?: PoolClient
  actor: SavingsTransactionActor
  member: SavingsTransactionMember
  account: SavingsTransactionAccount
  transaction: SavingsTransactionSummary
  destination?: SavingsTransferDestination | null
  currency?: string
}

export interface NotifySavingsTransactionResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

function buildMemberNotifications(
  input: NotifySavingsTransactionInput,
): CreateNotificationInput[] {
  const { actor, member, account, transaction, currency } = input
  const messages: CreateNotificationInput[] = []
  const base = {
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member" as const,
  }

  if (transaction.type === "Deposit") {
    const depositTpl = NotificationTemplates.depositReceived(
      transaction.amount,
      account.id,
      currency,
    )
    messages.push({
      ...base,
      recipientId: member.id,
      type: "deposit_received",
      title: depositTpl.title,
      message: depositTpl.message,
      actionUrl: depositTpl.actionUrl,
      metadata: {
        member_id: member.id,
        account_id: account.id,
        transaction_id: transaction.id,
        amount: transaction.amount,
      },
    })
  } else if (transaction.type === "Withdrawal") {
    const withdrawalTpl = NotificationTemplates.withdrawalProcessed(
      transaction.amount,
      account.id,
      currency,
    )
    messages.push({
      ...base,
      recipientId: member.id,
      type: "withdrawal_processed",
      title: withdrawalTpl.title,
      message: withdrawalTpl.message,
      actionUrl: withdrawalTpl.actionUrl,
      metadata: {
        member_id: member.id,
        account_id: account.id,
        transaction_id: transaction.id,
        amount: transaction.amount,
        charges: transaction.charges ?? undefined,
      },
    })
  } else if (transaction.type === "Transfer") {
    const transferTpl = NotificationTemplates.transferProcessed(
      transaction.amount,
      account.id,
      currency,
    )
    messages.push({
      ...base,
      recipientId: member.id,
      type: "transfer_processed",
      title: transferTpl.title,
      message: transferTpl.message,
      actionUrl: transferTpl.actionUrl,
      metadata: {
        member_id: member.id,
        account_id: account.id,
        transaction_id: transaction.id,
        amount: transaction.amount,
      },
    })
  }

  const txTpl = NotificationTemplates.transactionRecorded(
    transaction.amount,
    transaction.transaction_number,
    currency,
  )
  messages.push({
    ...base,
    recipientId: member.id,
    type: "transaction_recorded",
    title: txTpl.title,
    message: txTpl.message,
    actionUrl: txTpl.actionUrl,
    metadata: {
      member_id: member.id,
      transaction_id: transaction.id,
      transaction_number: transaction.transaction_number,
      amount: transaction.amount,
      account_id: account.id,
    },
  })

  const dest = input.destination
  if (dest) {
    const depositTpl = NotificationTemplates.depositReceived(
      dest.transaction.amount,
      dest.account.id,
      currency,
    )
    messages.push({
      ...base,
      recipientId: dest.member.id,
      type: "deposit_received",
      title: depositTpl.title,
      message: depositTpl.message,
      actionUrl: depositTpl.actionUrl,
      metadata: {
        member_id: dest.member.id,
        account_id: dest.account.id,
        transaction_id: dest.transaction.id,
        amount: dest.transaction.amount,
        transfer_deposit: true,
      },
    })

    const destTxTpl = NotificationTemplates.transactionRecorded(
      dest.transaction.amount,
      dest.transaction.transaction_number,
      currency,
    )
    messages.push({
      ...base,
      recipientId: dest.member.id,
      type: "transaction_recorded",
      title: destTxTpl.title,
      message: destTxTpl.message,
      actionUrl: destTxTpl.actionUrl,
      metadata: {
        member_id: dest.member.id,
        transaction_id: dest.transaction.id,
        transaction_number: dest.transaction.transaction_number,
        amount: dest.transaction.amount,
        account_id: dest.account.id,
        transfer_deposit: true,
      },
    })
  }

  return messages
}

/**
 * Fan out in-app notifications for a manual savings transaction.
 *
 * Member receives a type-specific notification (deposit / withdrawal / transfer)
 * plus transaction_recorded. Transfer destination members (to-account / receiver)
 * always receive deposit_received + transaction_recorded for the credit leg.
 *
 * Staff with view_transactions receive transaction_recorded.
 */
export async function notifySavingsTransaction(
  input: NotifySavingsTransactionInput,
): Promise<NotifySavingsTransactionResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, member } = input
  const currency = input.currency

  const memberMessages = buildMemberNotifications(input)
  const memberRes = await notificationService.createBulk(memberMessages, input.client)
  if (memberRes.ok) {
    memberNotifications = memberRes.count ?? memberMessages.length
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  if (input.client) {
    let recipients: AdminRecipient[] = []
    try {
      recipients = await getInstitutionRecipientsWithPermission(
        input.client,
        actor.institution_id,
        PERMISSIONS.transactions,
        { excludeUserId: actor.id },
      )
    } catch (e) {
      errors.push(`recipients:${PERMISSIONS.transactions}:${(e as Error)?.message || "lookup_failed"}`)
    }

    if (recipients.length > 0) {
      const tpl = NotificationTemplates.transactionRecordedForStaff(
        member.full_name,
        input.transaction.amount,
        input.transaction.transaction_number,
        member.id,
        currency,
      )
      const metadata: CreateNotificationInput["metadata"] = {
        member_id: member.id,
        transaction_id: input.transaction.id,
        transaction_number: input.transaction.transaction_number,
        amount: input.transaction.amount,
        account_id: input.account.id,
        transaction_type: input.transaction.type,
      }

      const staffMessages: CreateNotificationInput[] = recipients.map((r) => ({
        institutionId: actor.institution_id,
        branchId: r.branch_id ?? actor.branch_id,
        recipientType: "institution_user",
        recipientId: r.id,
        type: "transaction_recorded" as NotificationType,
        title: tpl.title,
        message: tpl.message,
        actionUrl: tpl.actionUrl,
        metadata,
      }))

      const staffRes = await notificationService.createBulk(staffMessages, input.client)
      if (staffRes.ok) {
        staffNotifications += staffRes.count ?? staffMessages.length
      } else if (staffRes.error) {
        errors.push(`staff_notifications:transaction_recorded:${staffRes.error}`)
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
