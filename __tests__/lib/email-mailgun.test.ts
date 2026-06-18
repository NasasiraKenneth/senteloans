import { sendMailgunMessage, resolvePlatformMailgunConfig } from "@/lib/email/providers/mailgun"

describe("sendMailgunMessage", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.MAILGUN_API_KEY
    delete process.env.MAILGUN_DOMAIN
    delete process.env.EMAIL_PLATFORM_FROM
  })

  it("returns ok when Mailgun accepts the message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "<msg-123>" }),
    }) as typeof fetch

    const result = await sendMailgunMessage({
      apiKey: "test-key",
      domain: "mg.example.com",
      from: "noreply@example.com",
      to: "member@example.com",
      subject: "Hello",
      text: "Body",
      html: "<p>Body</p>",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.messageId).toBe("<msg-123>")
  })

  it("returns error when Mailgun rejects the message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Forbidden",
    }) as typeof fetch

    const result = await sendMailgunMessage({
      apiKey: "bad",
      domain: "mg.example.com",
      from: "noreply@example.com",
      to: "member@example.com",
      subject: "Hello",
      text: "Body",
    })

    expect(result.ok).toBe(false)
  })
})

describe("resolvePlatformMailgunConfig", () => {
  afterEach(() => {
    delete process.env.MAILGUN_API_KEY
    delete process.env.MAILGUN_DOMAIN
    delete process.env.EMAIL_PLATFORM_FROM
    delete process.env.CONTACT_EMAIL
  })

  it("returns null when env is incomplete", () => {
    expect(resolvePlatformMailgunConfig()).toBeNull()
  })

  it("returns config when env vars are set", () => {
    process.env.MAILGUN_API_KEY = "key"
    process.env.MAILGUN_DOMAIN = "mg.example.com"
    process.env.CONTACT_EMAIL = "info@example.com"
    expect(resolvePlatformMailgunConfig()).toEqual({
      apiKey: "key",
      domain: "mg.example.com",
      from: "info@example.com",
    })
  })
})
