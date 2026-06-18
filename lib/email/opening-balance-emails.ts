import { enqueueMemberEmail } from "./enqueue-member-email"
import type { EmailJobData } from "@/queues/email.queue"

/**
 * Email templates the worker resolves for opening-balance events. Placeholder
 * contract until a real mail provider is wired in (mirrors fee-emails).
 */
export const OPENING_BALANCE_EMAIL_TEMPLATES = {
  recorded: "opening_balance.recorded",
} as const

export interface OpeningBalanceEmailMember {
  id: string
  full_name: string
  member_number: string
  email: string
}

export interface OpeningBalanceEmailSavingsAccount {
  accountNumber: string
  accountType: string
  openingBalance: number
}

export interface OpeningBalanceEmailLoan {
  applicationId: string
  productName: string
  principalAmount: number
  amountPaid: number
  outstanding: number
}

export type OpeningBalanceEmailContext = NonNullable<EmailJobData["context"]>

export interface OpeningBalanceEmailInput {
  member: OpeningBalanceEmailMember
  institutionName: string
  currency?: string
  savings?: {
    amount: number
    accounts: OpeningBalanceEmailSavingsAccount[]
  } | null
  loan?: OpeningBalanceEmailLoan | null
  context?: OpeningBalanceEmailContext
}

export interface EnqueuedEmailsResult {
  enqueued: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Enqueue a single opening-balance confirmation email summarizing the savings
 * and/or loan balances recorded. Skipped (without raising) when the member has
 * no email or nothing was recorded. Fire-and-forget: returns a summary, never
 * throws — a queue outage cannot break the HTTP response.
 */
export async function enqueueOpeningBalanceEmails(
  input: OpeningBalanceEmailInput,
): Promise<EnqueuedEmailsResult> {
  const result: EnqueuedEmailsResult = { enqueued: [], skipped: [], errors: [] }

  if (!input.savings && !input.loan) {
    result.skipped.push("opening_balance:nothing_recorded")
    return result
  }

  const email = input.member.email?.trim()
  if (!email) {
    result.skipped.push("opening_balance:no_email")
    return result
  }

  await enqueueMemberEmail(
    input.member.id,
    {
      to: email,
      subject: "Opening Balances Recorded",
      template: OPENING_BALANCE_EMAIL_TEMPLATES.recorded,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        currency: input.currency || "UGX",
        savingsAccounts: (input.savings?.accounts ?? []).map((account) => ({
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          openingBalance: account.openingBalance,
        })),
        loan: input.loan
          ? {
              applicationId: input.loan.applicationId,
              productName: input.loan.productName,
              principalAmount: input.loan.principalAmount,
              amountPaid: input.loan.amountPaid,
              outstanding: input.loan.outstanding,
            }
          : null,
      },
      context: input.context,
    },
    "opening_balance",
    result,
    {
      openingBalanceHasSavings: Boolean(input.savings),
      openingBalanceHasLoan: Boolean(input.loan),
    },
  )

  return result
}
