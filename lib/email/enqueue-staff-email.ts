import type { EmailJobData } from "@/queues/email.queue"
import { enqueueEmail } from "@/queues/email.queue"
import { notificationTypeForEmailTemplate } from "./template-notification-map"
import { isStaffEmailEnabled } from "./preference-gate"
import type { EnqueuedEmailsResult } from "./member-emails"

const SKIP_PREF_CHECK_TEMPLATES = new Set(["email.test"])

/**
 * Enqueue a staff email after checking notification_preferences.email_enabled.
 */
export async function enqueueStaffEmail(
  staffId: string,
  job: EmailJobData,
  label: string,
  out: EnqueuedEmailsResult,
): Promise<void> {
  if (!SKIP_PREF_CHECK_TEMPLATES.has(job.template)) {
    const notificationType = notificationTypeForEmailTemplate(job.template)
    if (notificationType) {
      const allowed = await isStaffEmailEnabled(staffId, notificationType)
      if (!allowed) {
        out.skipped.push(`${label}:email_pref_disabled`)
        return
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
