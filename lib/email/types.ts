export type EmailProvider = "mailgun" | "smtp" | "sendgrid" | "ses"

export const EMAIL_PROVIDERS: EmailProvider[] = ["mailgun", "smtp", "sendgrid", "ses"]

export type EmailAttachmentSpec =
  | { kind: "invoice"; invoiceId: string }
  | { kind: "receipt"; transactionId: string }

export interface EmailContext {
  institutionId?: string
  branchId?: string
  actorId?: string
}

export interface BranchEmailSettingsRow {
  id: string
  institution_id: string
  branch_id: string
  provider: string
  from_email: string | null
  reply_to_email: string | null
  domain: string | null
  api_key: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_username: string | null
  smtp_password: string | null
  is_active: boolean
}

export interface RenderedEmail {
  html: string
  text: string
}

export type SendEmailResult =
  | { ok: true; provider: string; messageId?: string }
  | { ok: false; skipped?: boolean; error: string }
