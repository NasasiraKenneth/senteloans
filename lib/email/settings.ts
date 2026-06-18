import type { PoolClient } from "pg"
import type { BranchEmailSettingsRow } from "./types"

export const maskSecret = (value: string | null | undefined): string | null => {
  const v = String(value || "").trim()
  if (!v) return null
  if (v.length <= 4) return "••••"
  return `••••${v.slice(-4)}`
}

export async function loadBranchEmailSettings(
  client: PoolClient,
  branchId: string,
): Promise<BranchEmailSettingsRow | null> {
  const res = await client.query<BranchEmailSettingsRow>(
    `SELECT
       id, institution_id, branch_id, provider,
       from_email, reply_to_email, domain, api_key,
       smtp_host, smtp_port, smtp_username, smtp_password,
       is_active
     FROM email_settings
     WHERE branch_id = $1
     LIMIT 1`,
    [branchId],
  )
  return res.rows[0] || null
}

export type PublicEmailSettings = {
  provider: string
  fromEmail: string | null
  replyToEmail: string | null
  domain: string | null
  smtpHost: string | null
  smtpPort: number | null
  smtpUsername: string | null
  isActive: boolean
  hasApiKey: boolean
  hasSmtpPassword: boolean
  apiKeyMasked: string | null
}

export function toPublicEmailSettings(row: BranchEmailSettingsRow): PublicEmailSettings {
  return {
    provider: String(row.provider || "mailgun"),
    fromEmail: row.from_email,
    replyToEmail: row.reply_to_email,
    domain: row.domain,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port == null ? null : Number(row.smtp_port),
    smtpUsername: row.smtp_username,
    isActive: Boolean(row.is_active),
    hasApiKey: Boolean(String(row.api_key || "").trim()),
    hasSmtpPassword: Boolean(String(row.smtp_password || "").trim()),
    apiKeyMasked: maskSecret(row.api_key),
  }
}
