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

// ---------------------------------------------------------------------------
// Share Transfer Events
// ---------------------------------------------------------------------------

export interface ShareTransferActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface ShareTransferMember {
  id: string
  full_name: string
  member_number: string
}

export interface ShareTransferTransaction {
  id: string
  transaction_number: string
  amount: number
}

export interface NotifyShareTransferInput {
  client?: PoolClient
  actor: ShareTransferActor
  fromMember: ShareTransferMember
  toMember: ShareTransferMember
  shares: {
    numberOfShares: number
    totalValue: number
  }
  fromTransaction: ShareTransferTransaction
  toTransaction: ShareTransferTransaction
  currency?: string
}

export interface NotifyShareTransferResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications for a share transfer between two members.
 *
 * Sender receives:
 *   - shares_transferred (transferred out)
 *   - transaction_recorded
 *
 * Receiver receives:
 *   - shares_transferred (received)
 *   - transaction_recorded
 *
 * Staff receive:
 *   - shares_transferred (gated by view_members)
 *   - transaction_recorded (gated by view_transactions)
 */
export async function notifyShareTransfer(
  input: NotifyShareTransferInput,
): Promise<NotifyShareTransferResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, fromMember, toMember, shares, fromTransaction, toTransaction } = input
  const currency = input.currency

  const memberMessages: CreateNotificationInput[] = []

  // 1. Sender member
  const fromSharesTpl = NotificationTemplates.sharesTransferred(
    shares.numberOfShares,
    shares.totalValue,
    toMember.full_name,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: fromMember.id,
    type: "shares_transferred",
    title: fromSharesTpl.title,
    message: fromSharesTpl.message,
    actionUrl: fromSharesTpl.actionUrl,
    metadata: {
      member_id: fromMember.id,
      target_member_id: toMember.id,
      number_of_shares: shares.numberOfShares,
      amount: shares.totalValue,
    },
  })

  const fromTxTpl = NotificationTemplates.transactionRecorded(
    fromTransaction.amount,
    fromTransaction.transaction_number,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: fromMember.id,
    type: "transaction_recorded",
    title: fromTxTpl.title,
    message: fromTxTpl.message,
    actionUrl: fromTxTpl.actionUrl,
    metadata: {
      member_id: fromMember.id,
      transaction_id: fromTransaction.id,
      transaction_number: fromTransaction.transaction_number,
      amount: fromTransaction.amount,
    },
  })

  // 2. Receiver member
  const toSharesTpl = NotificationTemplates.sharesTransferReceived(
    shares.numberOfShares,
    shares.totalValue,
    fromMember.full_name,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: toMember.id,
    type: "shares_transferred",
    title: toSharesTpl.title,
    message: toSharesTpl.message,
    actionUrl: toSharesTpl.actionUrl,
    metadata: {
      member_id: toMember.id,
      source_member_id: fromMember.id,
      number_of_shares: shares.numberOfShares,
      amount: shares.totalValue,
    },
  })

  const toTxTpl = NotificationTemplates.transactionRecorded(
    toTransaction.amount,
    toTransaction.transaction_number,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: toMember.id,
    type: "transaction_recorded",
    title: toTxTpl.title,
    message: toTxTpl.message,
    actionUrl: toTxTpl.actionUrl,
    metadata: {
      member_id: toMember.id,
      transaction_id: toTransaction.id,
      transaction_number: toTransaction.transaction_number,
      amount: toTransaction.amount,
    },
  })

  const memberRes = await notificationService.createBulk(memberMessages, input.client)
  if (memberRes.ok) {
    memberNotifications = memberRes.count ?? memberMessages.length
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  // 3. Staff side
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

  await fanOutToStaff(
    PERMISSIONS.shares,
    "shares_transferred",
    NotificationTemplates.sharesTransferredForStaff(
      fromMember.full_name,
      toMember.full_name,
      shares.numberOfShares,
      shares.totalValue,
      fromMember.id,
      currency,
    ),
    {
      sender_id: fromMember.id,
      recipient_id: toMember.id,
      number_of_shares: shares.numberOfShares,
      amount: shares.totalValue,
    },
  )

  await fanOutToStaff(
    PERMISSIONS.transactions,
    "transaction_recorded",
    NotificationTemplates.transactionRecordedForStaff(
      fromMember.full_name,
      fromTransaction.amount,
      fromTransaction.transaction_number,
      fromMember.id,
      currency,
    ),
    {
      member_id: fromMember.id,
      transaction_id: fromTransaction.id,
      transaction_number: fromTransaction.transaction_number,
      amount: fromTransaction.amount,
    },
  )

  await fanOutToStaff(
    PERMISSIONS.transactions,
    "transaction_recorded",
    NotificationTemplates.transactionRecordedForStaff(
      toMember.full_name,
      toTransaction.amount,
      toTransaction.transaction_number,
      toMember.id,
      currency,
    ),
    {
      member_id: toMember.id,
      transaction_id: toTransaction.id,
      transaction_number: toTransaction.transaction_number,
      amount: toTransaction.amount,
    },
  )

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}

// ---------------------------------------------------------------------------
// Share Buy Off Events
// ---------------------------------------------------------------------------

export interface ShareBuyOffActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface ShareBuyOffMember {
  id: string
  full_name: string
  member_number: string
}

export interface ShareBuyOffTransaction {
  id: string
  transaction_number: string
  amount: number
  accountId?: string | null
}

export interface NotifyShareBuyOffInput {
  client?: PoolClient
  actor: ShareBuyOffActor
  sellerMember: ShareBuyOffMember
  buyerMember: ShareBuyOffMember
  shares: {
    numberOfShares: number
    totalValue: number
  }
  sellerTransaction: ShareBuyOffTransaction
  buyerTransaction: ShareBuyOffTransaction
  sellerSavingsTransaction?: ShareBuyOffTransaction | null
  buyerSavingsTransaction?: ShareBuyOffTransaction | null
  currency?: string
}

export interface NotifyShareBuyOffResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications for a share buy-off/sell.
 *
 * Seller receives:
 *   - shares_sold
 *   - transaction_recorded (for share sale transaction)
 *   - deposit_received & transaction_recorded (for savings account credit)
 *
 * Buyer receives:
 *   - shares_purchased
 *   - transaction_recorded (for share purchase transaction)
 *   - withdrawal_processed & transaction_recorded (for savings account debit if applicable)
 *
 * Staff receive:
 *   - shares_purchased (gated by view_members)
 *   - transaction_recorded (gated by view_transactions)
 */
export async function notifyShareBuyOff(
  input: NotifyShareBuyOffInput,
): Promise<NotifyShareBuyOffResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const {
    actor,
    sellerMember,
    buyerMember,
    shares,
    sellerTransaction,
    buyerTransaction,
    sellerSavingsTransaction,
    buyerSavingsTransaction,
  } = input
  const currency = input.currency

  const memberMessages: CreateNotificationInput[] = []

  // 1. Seller member
  const sellerSharesTpl = NotificationTemplates.sharesSold(
    shares.numberOfShares,
    shares.totalValue,
    buyerMember.full_name,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: sellerMember.id,
    type: "shares_sold",
    title: sellerSharesTpl.title,
    message: sellerSharesTpl.message,
    actionUrl: sellerSharesTpl.actionUrl,
    metadata: {
      member_id: sellerMember.id,
      buyer_member_id: buyerMember.id,
      number_of_shares: shares.numberOfShares,
      amount: shares.totalValue,
    },
  })

  const sellerTxTpl = NotificationTemplates.transactionRecorded(
    sellerTransaction.amount,
    sellerTransaction.transaction_number,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: sellerMember.id,
    type: "transaction_recorded",
    title: sellerTxTpl.title,
    message: sellerTxTpl.message,
    actionUrl: sellerTxTpl.actionUrl,
    metadata: {
      member_id: sellerMember.id,
      transaction_id: sellerTransaction.id,
      transaction_number: sellerTransaction.transaction_number,
      amount: sellerTransaction.amount,
    },
  })

  if (sellerSavingsTransaction) {
    const depositTpl = NotificationTemplates.depositReceived(
      sellerSavingsTransaction.amount,
      sellerSavingsTransaction.accountId || undefined,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: sellerMember.id,
      type: "deposit_received",
      title: depositTpl.title,
      message: depositTpl.message,
      actionUrl: depositTpl.actionUrl,
      metadata: {
        member_id: sellerMember.id,
        account_id: sellerSavingsTransaction.accountId || undefined,
        transaction_id: sellerSavingsTransaction.id,
        amount: sellerSavingsTransaction.amount,
      },
    })

    const sellerSavingsTxTpl = NotificationTemplates.transactionRecorded(
      sellerSavingsTransaction.amount,
      sellerSavingsTransaction.transaction_number,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: sellerMember.id,
      type: "transaction_recorded",
      title: sellerSavingsTxTpl.title,
      message: sellerSavingsTxTpl.message,
      actionUrl: sellerSavingsTxTpl.actionUrl,
      metadata: {
        member_id: sellerMember.id,
        transaction_id: sellerSavingsTransaction.id,
        transaction_number: sellerSavingsTransaction.transaction_number,
        amount: sellerSavingsTransaction.amount,
      },
    })
  }

  // 2. Buyer member
  const buyerSharesTpl = NotificationTemplates.sharesBuyOff(
    shares.numberOfShares,
    shares.totalValue,
    sellerMember.full_name,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: buyerMember.id,
    type: "shares_purchased",
    title: buyerSharesTpl.title,
    message: buyerSharesTpl.message,
    actionUrl: buyerSharesTpl.actionUrl,
    metadata: {
      member_id: buyerMember.id,
      seller_member_id: sellerMember.id,
      number_of_shares: shares.numberOfShares,
      amount: shares.totalValue,
    },
  })

  const buyerTxTpl = NotificationTemplates.transactionRecorded(
    buyerTransaction.amount,
    buyerTransaction.transaction_number,
    currency,
  )
  memberMessages.push({
    institutionId: actor.institution_id,
    branchId: actor.branch_id,
    recipientType: "member",
    recipientId: buyerMember.id,
    type: "transaction_recorded",
    title: buyerTxTpl.title,
    message: buyerTxTpl.message,
    actionUrl: buyerTxTpl.actionUrl,
    metadata: {
      member_id: buyerMember.id,
      transaction_id: buyerTransaction.id,
      transaction_number: buyerTransaction.transaction_number,
      amount: buyerTransaction.amount,
    },
  })

  if (buyerSavingsTransaction) {
    const withdrawTpl = NotificationTemplates.withdrawalProcessed(
      buyerSavingsTransaction.amount,
      buyerSavingsTransaction.accountId || undefined,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: buyerMember.id,
      type: "withdrawal_processed",
      title: withdrawTpl.title,
      message: withdrawTpl.message,
      actionUrl: withdrawTpl.actionUrl,
      metadata: {
        member_id: buyerMember.id,
        account_id: buyerSavingsTransaction.accountId || undefined,
        transaction_id: buyerSavingsTransaction.id,
        amount: buyerSavingsTransaction.amount,
      },
    })

    const buyerSavingsTxTpl = NotificationTemplates.transactionRecorded(
      buyerSavingsTransaction.amount,
      buyerSavingsTransaction.transaction_number,
      currency,
    )
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: buyerMember.id,
      type: "transaction_recorded",
      title: buyerSavingsTxTpl.title,
      message: buyerSavingsTxTpl.message,
      actionUrl: buyerSavingsTxTpl.actionUrl,
      metadata: {
        member_id: buyerMember.id,
        transaction_id: buyerSavingsTransaction.id,
        transaction_number: buyerSavingsTransaction.transaction_number,
        amount: buyerSavingsTransaction.amount,
      },
    })
  }

  const memberRes = await notificationService.createBulk(memberMessages, input.client)
  if (memberRes.ok) {
    memberNotifications = memberRes.count ?? memberMessages.length
  } else if (memberRes.error) {
    errors.push(`member_notifications:${memberRes.error}`)
  }

  // 3. Staff side
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

  await fanOutToStaff(
    PERMISSIONS.shares,
    "shares_purchased",
    NotificationTemplates.sharesBuyOffForStaff(
      buyerMember.full_name,
      sellerMember.full_name,
      shares.numberOfShares,
      shares.totalValue,
      buyerMember.id,
      currency,
    ),
    {
      buyer_id: buyerMember.id,
      seller_id: sellerMember.id,
      number_of_shares: shares.numberOfShares,
      amount: shares.totalValue,
    },
  )

  await fanOutToStaff(
    PERMISSIONS.transactions,
    "transaction_recorded",
    NotificationTemplates.transactionRecordedForStaff(
      buyerMember.full_name,
      buyerTransaction.amount,
      buyerTransaction.transaction_number,
      buyerMember.id,
      currency,
    ),
    {
      member_id: buyerMember.id,
      transaction_id: buyerTransaction.id,
      transaction_number: buyerTransaction.transaction_number,
      amount: buyerTransaction.amount,
    },
  )

  await fanOutToStaff(
    PERMISSIONS.transactions,
    "transaction_recorded",
    NotificationTemplates.transactionRecordedForStaff(
      sellerMember.full_name,
      sellerTransaction.amount,
      sellerTransaction.transaction_number,
      sellerMember.id,
      currency,
    ),
    {
      member_id: sellerMember.id,
      transaction_id: sellerTransaction.id,
      transaction_number: sellerTransaction.transaction_number,
      amount: sellerTransaction.amount,
    },
  )

  return {
    ok: errors.length === 0,
    memberNotifications,
    staffNotifications,
    errors,
  }
}
