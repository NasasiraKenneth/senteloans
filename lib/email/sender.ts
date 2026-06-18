import type { PoolClient } from "pg"
import type { EmailJobData } from "@/queues/email.queue"
import { runWithoutAuth } from "@/lib/db"
import { loadBranchEmailSettings } from "./settings"
import { renderEmailTemplate } from "./render-template"
import { resolvePlatformMailgunConfig, sendMailgunMessage } from "./providers/mailgun"
import { sendSmtpMessage } from "./providers/smtp"
import {
  cleanupEmailAttachmentFiles,
  resolveEmailAttachments,
  type ResolvedEmailAttachment,
} from "./resolve-attachments"
import type { BranchEmailSettingsRow, SendEmailResult } from "./types"

const platformFallbackEnabled = (): boolean =>
  String(process.env.EMAIL_PLATFORM_FALLBACK || "").trim().toLowerCase() === "true"

async function sendWithMailgunSettings(
  settings: Pick<BranchEmailSettingsRow, "api_key" | "domain" | "from_email" | "reply_to_email">,
  job: EmailJobData,
  rendered: { html: string; text: string },
  attachments: ResolvedEmailAttachment[],
): Promise<SendEmailResult> {
  const apiKey = String(settings.api_key || "").trim()
  const domain = String(settings.domain || "").trim()
  const from = String(settings.from_email || "").trim()
  if (!apiKey || !domain || !from) {
    return { ok: false, error: "mailgun_config_incomplete" }
  }

  const result = await sendMailgunMessage({
    apiKey,
    domain,
    from,
    to: job.to,
    subject: job.subject,
    text: rendered.text,
    html: rendered.html,
    replyTo: settings.reply_to_email,
    attachments,
  })

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, provider: "mailgun", messageId: result.messageId }
}

async function sendWithSmtpSettings(
  settings: Pick<
    BranchEmailSettingsRow,
    "smtp_host" | "smtp_port" | "smtp_username" | "smtp_password" | "from_email" | "reply_to_email"
  >,
  job: EmailJobData,
  rendered: { html: string; text: string },
  attachments: ResolvedEmailAttachment[],
): Promise<SendEmailResult> {
  const host = String(settings.smtp_host || "").trim()
  const port = Number(settings.smtp_port)
  const from = String(settings.from_email || "").trim()
  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    return { ok: false, error: "smtp_config_incomplete" }
  }

  const result = await sendSmtpMessage({
    host,
    port,
    username: settings.smtp_username,
    password: settings.smtp_password,
    from,
    to: job.to,
    subject: job.subject,
    text: rendered.text,
    html: rendered.html,
    replyTo: settings.reply_to_email,
    attachments,
  })

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, provider: "smtp", messageId: result.messageId }
}

export async function sendTransactionalEmail(
  job: EmailJobData,
  client?: PoolClient,
): Promise<SendEmailResult> {
  const branchId = String(job.context?.branchId || "").trim()
  if (!branchId) {
    return { ok: false, error: "missing_branch_id" }
  }

  const rendered =
    job.kind === "html" && typeof job.template === "string"
      ? { html: job.template, text: job.template.replace(/<[^>]+>/g, " ") }
      : renderEmailTemplate(job.template, job.data || {})

  const run = async (db: PoolClient): Promise<SendEmailResult> => {
    const { attachments, tempFiles } = await resolveEmailAttachments(db, job)
    try {
      const settings = await loadBranchEmailSettings(db, branchId)
      const provider = String(settings?.provider || "").toLowerCase()

      if (settings?.is_active && provider === "mailgun") {
        return sendWithMailgunSettings(settings, job, rendered, attachments)
      }

      if (settings?.is_active && provider === "smtp") {
        return sendWithSmtpSettings(settings, job, rendered, attachments)
      }

      if (platformFallbackEnabled()) {
        const platform = resolvePlatformMailgunConfig()
        if (platform) {
          const result = await sendMailgunMessage({
            apiKey: platform.apiKey,
            domain: platform.domain,
            from: platform.from,
            to: job.to,
            subject: job.subject,
            text: rendered.text,
            html: rendered.html,
            attachments,
          })
          if (!result.ok) {
            return { ok: false, error: result.error }
          }
          return { ok: true, provider: "mailgun_platform_fallback", messageId: result.messageId }
        }
      }

      if (!settings?.is_active) {
        return { ok: false, skipped: true, error: "email_inactive" }
      }

      if (provider && provider !== "mailgun" && provider !== "smtp") {
        return { ok: false, error: `provider_not_implemented:${provider}` }
      }

      return { ok: false, error: "email_settings_not_configured" }
    } finally {
      await cleanupEmailAttachmentFiles(tempFiles)
    }
  }

  if (client) return run(client)
  return runWithoutAuth(run)
}
