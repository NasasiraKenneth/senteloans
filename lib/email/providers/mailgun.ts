export type EmailAttachmentInput = {
  filename: string
  content: Buffer
}

export type MailgunSendInput = {
  apiKey: string
  domain: string
  from: string
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string | null
  attachments?: EmailAttachmentInput[]
}

export type MailgunSendResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string }

export async function sendMailgunMessage(input: MailgunSendInput): Promise<MailgunSendResult> {
  const attachments = input.attachments || []

  try {
    let body: BodyInit
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`api:${input.apiKey}`).toString("base64")}`,
    }

    if (attachments.length > 0) {
      const form = new FormData()
      form.append("from", input.from)
      form.append("to", input.to)
      form.append("subject", input.subject)
      form.append("text", input.text)
      if (input.html) form.append("html", input.html)
      if (input.replyTo) form.append("h:Reply-To", input.replyTo)

      for (const file of attachments) {
        form.append("attachment", new Blob([file.content], { type: "application/pdf" }), file.filename)
      }
      body = form
    } else {
      const form = new URLSearchParams()
      form.append("from", input.from)
      form.append("to", input.to)
      form.append("subject", input.subject)
      form.append("text", input.text)
      if (input.html) form.append("html", input.html)
      if (input.replyTo) form.append("h:Reply-To", input.replyTo)
      headers["Content-Type"] = "application/x-www-form-urlencoded"
      body = form.toString()
    }

    const response = await fetch(`https://api.mailgun.net/v3/${input.domain}/messages`, {
      method: "POST",
      headers,
      body,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return { ok: false, error: body || `mailgun_http_${response.status}` }
    }

    const json = (await response.json().catch(() => ({}))) as { id?: string }
    return { ok: true, messageId: json.id }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "mailgun_request_failed" }
  }
}

export function resolvePlatformMailgunConfig(): { apiKey: string; domain: string; from: string } | null {
  const apiKey = String(process.env.MAILGUN_API_KEY || "").trim()
  const domain = String(process.env.MAILGUN_DOMAIN || "").trim()
  const from = String(process.env.EMAIL_PLATFORM_FROM || process.env.CONTACT_EMAIL || "").trim()
  if (!apiKey || !domain || !from) return null
  return { apiKey, domain, from }
}
