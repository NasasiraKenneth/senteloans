import nodemailer from "nodemailer"

export type SmtpSendInput = {
  host: string
  port: number
  username?: string | null
  password?: string | null
  from: string
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string | null
  attachments?: Array<{ filename: string; content: Buffer }>
}

export type SmtpSendResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string }

export async function sendSmtpMessage(input: SmtpSendInput): Promise<SmtpSendResult> {
  const host = String(input.host || "").trim()
  const port = Number(input.port)
  const from = String(input.from || "").trim()
  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    return { ok: false, error: "smtp_config_incomplete" }
  }

  const secure = port === 465
  const user = String(input.username || "").trim()
  const pass = String(input.password || "").replace(/\s/g, "")

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure && port === 587,
      auth: user ? { user, pass } : undefined,
    })

    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo || undefined,
      attachments: (input.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: "application/pdf",
      })),
    })

    return { ok: true, messageId: info.messageId }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "smtp_send_failed" }
  }
}
