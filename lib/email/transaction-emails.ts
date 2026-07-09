import { enqueueMemberEmail } from "./enqueue-member-email"
import type { SavingsTransactionType } from "@/lib/notifications/transaction-events"

export const SAVINGS_TRANSACTION_EMAIL_TEMPLATES = {
  deposit: "savings.deposit",
  withdrawal: "savings.withdrawal",
  transfer: "savings.transfer",
  transferDeposit: "savings.transfer_deposit",
} as const

export interface SavingsTransactionEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface SavingsTransactionEmailAccount {
  id: string
  account_number: string
}

export interface SavingsTransactionEmailInput {
  member: SavingsTransactionEmailMember
  institutionName: string
  currency?: string
  type: SavingsTransactionType
  account: SavingsTransactionEmailAccount
  transaction: {
    id: string
    transaction_number: string
    amount: number
    balance_after: number
    mode: string
    charges?: number | null
    transaction_date?: string | null
  }
  destination?: {
    member: SavingsTransactionEmailMember
    account: SavingsTransactionEmailAccount
    transaction: {
      id: string
      transaction_number: string
      amount: number
      balance_after: number
    }
  } | null
  context?: { institutionId?: string; branchId?: string; actorId?: string }
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

function templateForType(type: SavingsTransactionType): string {
  if (type === "Deposit") return SAVINGS_TRANSACTION_EMAIL_TEMPLATES.deposit
  if (type === "Withdrawal") return SAVINGS_TRANSACTION_EMAIL_TEMPLATES.withdrawal
  return SAVINGS_TRANSACTION_EMAIL_TEMPLATES.transfer
}

function subjectForType(type: SavingsTransactionType, accountNumber: string): string {
  const label = accountNumber || "your account"
  if (type === "Deposit") return `Deposit Received — ${label}`
  if (type === "Withdrawal") return `Withdrawal Processed — ${label}`
  return `Transfer Processed — ${label}`
}

/**
 * Enqueue savings transaction confirmation email(s), each with the matching
 * transaction receipt PDF attached.
 *
 * - Deposit / Withdrawal: one email to the acting member.
 * - Transfer: sender email (transfer receipt) + receiver email on the
 *   destination account (deposit receipt for the credit leg).
 */
export async function enqueueSavingsTransactionEmails(
  input: SavingsTransactionEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  const email = input.member.email?.trim()
  if (email) {
    await enqueueMemberEmail(
      input.member.id,
      {
        to: email,
        subject: subjectForType(input.type, input.account.account_number),
        template: templateForType(input.type),
        kind: "template",
        data: {
          memberName: input.member.full_name,
          memberNumber: input.member.member_number,
          institutionName: input.institutionName,
          currency: input.currency || "UGX",
          accountNumber: input.account.account_number,
          transactionType: input.type,
          amount: input.transaction.amount,
          balanceAfter: input.transaction.balance_after,
          mode: input.transaction.mode,
          charges: input.transaction.charges ?? null,
          transactionNumber: input.transaction.transaction_number,
          transactionDate: input.transaction.transaction_date ?? null,
        },
        attachmentSpecs: [{ kind: "receipt", transactionId: input.transaction.id }],
        context: input.context,
      },
      `savings_${input.type.toLowerCase()}`,
      result,
    )
  } else {
    result.skipped.push("savings_transaction:no_email")
  }

  const dest = input.destination
  if (dest) {
    const destEmail = dest.member.email?.trim()
    if (destEmail) {
      await enqueueMemberEmail(
        dest.member.id,
        {
          to: destEmail,
          subject: `Transfer Deposit Received — ${dest.account.account_number || "your account"}`,
          template: SAVINGS_TRANSACTION_EMAIL_TEMPLATES.transferDeposit,
          kind: "template",
          data: {
            memberName: dest.member.full_name,
            memberNumber: dest.member.member_number,
            institutionName: input.institutionName,
            currency: input.currency || "UGX",
            accountNumber: dest.account.account_number,
            sourceAccountNumber: input.account.account_number,
            transactionType: "Deposit",
            amount: dest.transaction.amount,
            balanceAfter: dest.transaction.balance_after,
            mode: input.transaction.mode,
            charges: null,
            transactionNumber: dest.transaction.transaction_number,
            transactionDate: input.transaction.transaction_date ?? null,
          },
          attachmentSpecs: [{ kind: "receipt", transactionId: dest.transaction.id }],
          context: input.context,
        },
        "savings_transfer_deposit",
        result,
      )
    } else {
      result.skipped.push("savings_transfer_deposit:no_email")
    }
  }

  return result
}
