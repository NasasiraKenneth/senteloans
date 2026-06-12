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
 * Opening balances can touch the savings and/or loans modules, each gated by
 * its own view permission.
 */
const PERMISSIONS = {
  savings: "view_savings",
  loans: "view_loans",
} as const

export interface OpeningBalanceActor {
  /** users.id of the staff member that recorded the opening balances. */
  id: string
  institution_id: string
  branch_id: string
}

export interface OpeningBalanceMember {
  id: string
  full_name: string
  member_number: string
}

export interface OpeningBalanceSavings {
  /** Opening savings balance that was set. */
  amount: number
  accountId?: string | null
}

export interface OpeningBalanceLoan {
  /** Outstanding balance recorded for the migrated loan. */
  outstanding: number
  loanId: string
}

export interface NotifyOpeningBalanceInput {
  client?: PoolClient
  actor: OpeningBalanceActor
  member: OpeningBalanceMember
  savings?: OpeningBalanceSavings | null
  loan?: OpeningBalanceLoan | null
  /** Branch currency code used to format amounts in notifications. */
  currency?: string
}

export interface NotifyOpeningBalanceResult {
  ok: boolean
  memberNotifications: number
  staffNotifications: number
  errors: string[]
}

/**
 * Fan out in-app notifications for recorded opening balances.
 *
 * Member (recipient_type='member') receives all applicable events:
 *   - opening_savings_recorded (when a savings opening balance was set)
 *   - opening_loan_recorded    (when an opening-balance loan was created)
 *
 * Staff (recipient_type='institution_user') only receive the notification for a
 * module they can view:
 *   - opening_savings_recorded -> view_savings
 *   - opening_loan_recorded    -> view_loans
 *
 * Best-effort: failures are collected into `errors` rather than thrown.
 */
export async function notifyOpeningBalance(
  input: NotifyOpeningBalanceInput,
): Promise<NotifyOpeningBalanceResult> {
  const errors: string[] = []
  let memberNotifications = 0
  let staffNotifications = 0

  const { actor, member } = input
  const currency = input.currency

  // ----- Member side: all applicable notifications -----
  const memberMessages: CreateNotificationInput[] = []

  if (input.savings) {
    const tpl = NotificationTemplates.openingSavingsRecorded(input.savings.amount, currency)
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: member.id,
      type: "opening_savings_recorded",
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata: {
        member_id: member.id,
        amount: input.savings.amount,
        account_id: input.savings.accountId ?? undefined,
      },
    })
  }

  if (input.loan) {
    const tpl = NotificationTemplates.openingLoanRecorded(input.loan.outstanding, currency)
    memberMessages.push({
      institutionId: actor.institution_id,
      branchId: actor.branch_id,
      recipientType: "member",
      recipientId: member.id,
      type: "opening_loan_recorded",
      title: tpl.title,
      message: tpl.message,
      actionUrl: tpl.actionUrl,
      metadata: {
        member_id: member.id,
        loan_id: input.loan.loanId,
        amount: input.loan.outstanding,
      },
    })
  }

  if (memberMessages.length > 0) {
    const memberRes = await notificationService.createBulk(memberMessages, input.client)
    if (memberRes.ok) {
      memberNotifications = memberRes.count ?? memberMessages.length
    } else if (memberRes.error) {
      errors.push(`member_notifications:${memberRes.error}`)
    }
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

  // opening_savings_recorded -> view_savings
  if (input.savings) {
    await fanOutToStaff(
      PERMISSIONS.savings,
      "opening_savings_recorded",
      NotificationTemplates.openingSavingsRecordedForStaff(
        member.full_name,
        input.savings.amount,
        member.id,
        currency,
      ),
      {
        member_id: member.id,
        amount: input.savings.amount,
        account_id: input.savings.accountId ?? undefined,
      },
    )
  }

  // opening_loan_recorded -> view_loans
  if (input.loan) {
    await fanOutToStaff(
      PERMISSIONS.loans,
      "opening_loan_recorded",
      NotificationTemplates.openingLoanRecordedForStaff(
        member.full_name,
        input.loan.outstanding,
        member.id,
        currency,
      ),
      {
        member_id: member.id,
        loan_id: input.loan.loanId,
        amount: input.loan.outstanding,
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
