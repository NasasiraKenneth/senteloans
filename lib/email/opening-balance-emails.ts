import { enqueueEmail } from "@/queues/email.queue"

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

export interface OpeningBalanceEmailInput {
  member: OpeningBalanceEmailMember
  institutionName: string
  currency?: string
  savings?: { amount: number } | null
  loan?: { outstanding: number } | null
  context?: { institutionId?: string; actorId?: string }
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

  try {
    await enqueueEmail({
      to: email,
      subject: "Opening Balances Recorded",
      template: OPENING_BALANCE_EMAIL_TEMPLATES.recorded,
      kind: "template",
      data: {
        memberName: input.member.full_name,
        memberNumber: input.member.member_number,
        institutionName: input.institutionName,
        currency: input.currency || "UGX",
        savingsAmount: input.savings?.amount ?? null,
        loanOutstanding: input.loan?.outstanding ?? null,
      },
      context: input.context,
    })
    result.enqueued.push("opening_balance")
  } catch (e) {
    result.errors.push(`opening_balance:${(e as Error)?.message || "enqueue_failed"}`)
  }

  return result
}
