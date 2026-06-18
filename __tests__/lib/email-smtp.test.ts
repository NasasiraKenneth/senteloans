jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}))

import nodemailer from "nodemailer"
import { sendSmtpMessage } from "@/lib/email/providers/smtp"

describe("sendSmtpMessage", () => {
  const mockSendMail = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    })
  })

  it("returns ok when SMTP accepts the message", async () => {
    mockSendMail.mockResolvedValue({ messageId: "smtp-123" })

    const result = await sendSmtpMessage({
      host: "smtp.example.com",
      port: 587,
      username: "user",
      password: "pass",
      from: "noreply@example.com",
      to: "member@example.com",
      subject: "Hello",
      text: "Body",
      html: "<p>Body</p>",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.messageId).toBe("smtp-123")
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false }),
    )
  })

  it("returns error when config is incomplete", async () => {
    const result = await sendSmtpMessage({
      host: "",
      port: 587,
      from: "noreply@example.com",
      to: "member@example.com",
      subject: "Hello",
      text: "Body",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("smtp_config_incomplete")
  })

  it("passes buffer attachments to nodemailer", async () => {
    mockSendMail.mockResolvedValue({ messageId: "smtp-attach" })

    const content = Buffer.from("%PDF-1.4")
    const result = await sendSmtpMessage({
      host: "smtp.example.com",
      port: 587,
      from: "noreply@example.com",
      to: "member@example.com",
      subject: "Invoice",
      text: "Body",
      attachments: [{ filename: "invoice.pdf", content }],
    })

    expect(result.ok).toBe(true)
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: "invoice.pdf", content, contentType: "application/pdf" }],
      }),
    )
  })

  it("returns error when send fails", async () => {
    mockSendMail.mockRejectedValue(new Error("connection refused"))

    const result = await sendSmtpMessage({
      host: "smtp.example.com",
      port: 465,
      from: "noreply@example.com",
      to: "member@example.com",
      subject: "Hello",
      text: "Body",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("connection refused")
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true }),
    )
  })
})
