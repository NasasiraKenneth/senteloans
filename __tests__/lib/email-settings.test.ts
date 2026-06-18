import { maskSecret, toPublicEmailSettings } from "@/lib/email/settings"
import type { BranchEmailSettingsRow } from "@/lib/email/types"

describe("email settings helpers", () => {
  it("masks secrets showing last four characters", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("••••mnop")
    expect(maskSecret("ab")).toBe("••••")
    expect(maskSecret(null)).toBeNull()
  })

  it("maps db row to public settings without exposing raw api key", () => {
    const row: BranchEmailSettingsRow = {
      id: "1",
      institution_id: "inst",
      branch_id: "branch",
      provider: "mailgun",
      from_email: "noreply@test.com",
      reply_to_email: null,
      domain: "mg.test.com",
      api_key: "secret-key-1234",
      smtp_host: null,
      smtp_port: null,
      smtp_username: null,
      smtp_password: null,
      is_active: true,
    }
    const pub = toPublicEmailSettings(row)
    expect(pub.hasApiKey).toBe(true)
    expect(pub.apiKeyMasked).toBe("••••1234")
    expect(pub.isActive).toBe(true)
    expect((pub as Record<string, unknown>).api_key).toBeUndefined()
  })
})
