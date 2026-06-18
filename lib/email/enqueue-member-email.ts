import type { EmailJobData } from "@/queues/email.queue"
import { enqueueEmail } from "@/queues/email.queue"
import { notificationTypeForEmailTemplate } from "./template-notification-map"
import { isMemberEmailEnabled, isOpeningBalanceEmailEnabled } from "./preference-gate"
import type { EnqueuedEmailsResult } from "./member-emails"

const SKIP_PREF_CHECK_TEMPLATES = new Set(["email.test"])

/**
 * Enqueue a member email after checking notification_preferences.email_enabled.
 */
export async function enqueueMemberEmail(
  memberId: string,
  job: EmailJobData,
  label: string,
  out: EnqueuedEmailsResult,
  opts?: { openingBalanceHasSavings?: boolean; openingBalanceHasLoan?: boolean },
): Promise<void> {
  if (!SKIP_PREF_CHECK_TEMPLATES.has(job.template)) {
    if (job.template === "opening_balance.recorded") {
      const allowed = await isOpeningBalanceEmailEnabled(
        memberId,
        Boolean(opts?.openingBalanceHasSavings),
        Boolean(opts?.openingBalanceHasLoan),
      )
      if (!allowed) {
        out.skipped.push(`${label}:email_pref_disabled`)
        return
      }
    } else {
      const notificationType = notificationTypeForEmailTemplate(job.template)
      if (notificationType) {
        const allowed = await isMemberEmailEnabled(memberId, notificationType)
        if (!allowed) {
          out.skipped.push(`${label}:email_pref_disabled`)
          return
        }
      }
    }
  }

  try {
    await enqueueEmail(job)
    out.enqueued.push(label)
  } catch (e) {
    out.errors.push(`${label}:${(e as Error)?.message || "enqueue_failed"}`)
  }
}
