import { hash } from "bcryptjs"
import { runWithoutAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { enqueueEmail } from "@/queues/email.queue"
import { sendTransactionalEmail } from "@/lib/email/sender"
import {
  buildPasswordResetUrl,
  completePasswordReset,
  generatePasswordResetToken,
  hashPasswordResetToken,
  maskEmail,
  requestPasswordReset,
  validatePasswordResetToken,
} from "@/lib/auth-password-reset"

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
}))

jest.mock("@/lib/db", () => ({
  runWithoutAuth: jest.fn(),
}))

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@/queues/email.queue", () => ({
  enqueueEmail: jest.fn(),
}))

jest.mock("@/lib/email/sender", () => ({
  sendTransactionalEmail: jest.fn(),
}))

const mockHash = hash as jest.MockedFunction<typeof hash>
const mockRunWithoutAuth = runWithoutAuth as jest.MockedFunction<typeof runWithoutAuth>
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>
const mockSendTransactionalEmail = sendTransactionalEmail as jest.MockedFunction<
  typeof sendTransactionalEmail
>
const mockAuditLogUpdate = auditLogger.logUpdate as jest.MockedFunction<
  typeof auditLogger.logUpdate
>

function createClientMock(sequence: Array<{ rows: unknown[]; rowCount?: number }>) {
  const query = jest.fn()
  for (const result of sequence) {
    query.mockResolvedValueOnce({
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
    })
  }
  return { query }
}

describe("lib/auth-password-reset", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHash.mockResolvedValue("hashed-new-password" as never)
    mockEnqueueEmail.mockResolvedValue({ id: "job-1" } as never)
    mockSendTransactionalEmail.mockResolvedValue({ ok: true, provider: "smtp" })
  })

  describe("helpers", () => {
    it("generates unique random tokens and deterministic sha256 hashes", () => {
      const first = generatePasswordResetToken()
      const second = generatePasswordResetToken()

      expect(first.rawToken).toHaveLength(64)
      expect(first.tokenHash).toHaveLength(64)
      expect(first.rawToken).not.toBe(second.rawToken)
      expect(hashPasswordResetToken(first.rawToken)).toBe(first.tokenHash)
    })

    it("masks email addresses safely", () => {
      expect(maskEmail("john.doe@example.com")).toBe("jo*****@example.com")
      expect(maskEmail("ab@example.com")).toBe("a***@example.com")
      expect(maskEmail("invalid")).toBe("***")
    })

    it("builds reset URLs using configured origin fallback", () => {
      const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL
      const prevNextAuthUrl = process.env.NEXTAUTH_URL
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.NEXTAUTH_URL

      expect(buildPasswordResetUrl("abc123", "https://sacco.ug/")).toBe(
        "https://sacco.ug/reset-password?token=abc123",
      )

      if (prevAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = prevAppUrl
      if (prevNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL
      else process.env.NEXTAUTH_URL = prevNextAuthUrl
    })
  })

  describe("requestPasswordReset", () => {
    it("returns silent ok when email does not exist", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([{ rows: [] }])
        return fn(client as never)
      })

      const result = await requestPasswordReset({ email: "unknown@example.com" })

      expect(result).toEqual({ ok: true, dispatched: false })
      expect(mockEnqueueEmail).not.toHaveBeenCalled()
    })

    it("skips duplicate requests within cooldown window", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          { rows: [{ id: "auth-1", email: "staff@sacco.ug", user_type: "institution_staff" }] },
          {
            rows: [
              {
                id: "user-1",
                full_name: "Alice Staff",
                institution_id: "inst-1",
                branch_id: "branch-1",
                institution_name: "Kampala SACCO",
                institution_logo: null,
              },
            ],
          },
          { rows: [] },
          { rows: [{ id: "recent-token-1" }], rowCount: 1 },
        ])
        return fn(client as never)
      })

      const result = await requestPasswordReset({ email: "staff@sacco.ug" })

      expect(result).toEqual({ ok: true, dispatched: false, rateLimited: true })
      expect(mockEnqueueEmail).not.toHaveBeenCalled()
    })

    it("invalidates previous tokens, stores hashed token, and enqueues email for active user", async () => {
      let capturedQueries: Array<[string, unknown[]?]> = []
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          { rows: [{ id: "auth-1", email: "member@sacco.ug", user_type: "member" }] },
          { rows: [] },
          {
            rows: [
              {
                id: "member-1",
                full_name: "Jane Member",
                institution_id: "inst-1",
                branch_id: "branch-1",
                institution_name: "Kampala SACCO",
                institution_logo: "https://cdn.example.com/logo.png",
              },
            ],
          },
          { rows: [], rowCount: 0 }, // cooldown check
          { rows: [] }, // BEGIN
          { rows: [], rowCount: 1 }, // invalidate prior tokens
          { rows: [], rowCount: 1 }, // insert new token
          { rows: [] }, // COMMIT
        ])
        const out = await fn(client as never)
        capturedQueries = client.query.mock.calls as Array<[string, unknown[]?]>
        return out
      })

      const result = await requestPasswordReset({
        email: "MEMBER@SACCO.UG",
        origin: "https://app.nyuki.ug",
        requestedIp: "127.0.0.1",
      })

      expect(result).toEqual({ ok: true, dispatched: true })
      expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
      const job = mockEnqueueEmail.mock.calls[0][0]
      expect(job.to).toBe("member@sacco.ug")
      expect(job.template).toBe("auth.password_reset")
      expect(job.context).toMatchObject({ institutionId: "inst-1", branchId: "branch-1" })
      expect(String(job.data?.resetUrl)).toContain("/reset-password?token=")

      // Ensure raw token is NOT stored in DB (stored value must match SHA-256 hash)
      const resetUrl = new URL(String(job.data?.resetUrl))
      const rawToken = resetUrl.searchParams.get("token") || ""
      const insertCall = capturedQueries.find(([sql]) =>
        sql.includes("INSERT INTO password_reset_tokens"),
      )
      expect(insertCall).toBeDefined()
      expect(insertCall?.[1]?.[1]).toBe(hashPasswordResetToken(rawToken))
      expect(insertCall?.[1]?.[1]).not.toBe(rawToken)
    })

    it("falls back to direct sendTransactionalEmail if Redis enqueue fails", async () => {
      mockEnqueueEmail.mockRejectedValueOnce(new Error("redis unavailable"))
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          { rows: [{ id: "auth-1", email: "staff@sacco.ug", user_type: "institution_staff" }] },
          {
            rows: [
              {
                id: "user-1",
                full_name: "Alice Staff",
                institution_id: "inst-1",
                branch_id: "branch-1",
                institution_name: "Kampala SACCO",
                institution_logo: null,
              },
            ],
          },
          { rows: [] },
          { rows: [], rowCount: 0 },
          { rows: [] },
          { rows: [] },
          { rows: [] },
          { rows: [] },
        ])
        return fn(client as never)
      })

      const result = await requestPasswordReset({ email: "staff@sacco.ug" })

      expect(result).toEqual({ ok: true, dispatched: true })
      expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe("validatePasswordResetToken", () => {
    it("returns missing when token is empty", async () => {
      expect(await validatePasswordResetToken("")).toEqual({ valid: false, reason: "missing" })
    })

    it("returns invalid when token hash is not found", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([{ rows: [] }])
        return fn(client as never)
      })

      expect(await validatePasswordResetToken("bad-token")).toEqual({
        valid: false,
        reason: "invalid",
      })
    })

    it("returns used when token has already been consumed", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          {
            rows: [
              {
                email: "user@sacco.ug",
                used_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 60_000).toISOString(),
              },
            ],
          },
        ])
        return fn(client as never)
      })

      expect(await validatePasswordResetToken("used-token")).toEqual({
        valid: false,
        reason: "used",
      })
    })

    it("returns expired when token expiry is in the past", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          {
            rows: [
              {
                email: "user@sacco.ug",
                used_at: null,
                expires_at: new Date(Date.now() - 60_000).toISOString(),
              },
            ],
          },
        ])
        return fn(client as never)
      })

      expect(await validatePasswordResetToken("expired-token")).toEqual({
        valid: false,
        reason: "expired",
      })
    })

    it("returns valid with masked email for active token", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          {
            rows: [
              {
                email: "alice@sacco.ug",
                used_at: null,
                expires_at: new Date(Date.now() + 60_000).toISOString(),
              },
            ],
          },
        ])
        return fn(client as never)
      })

      expect(await validatePasswordResetToken("good-token")).toEqual({
        valid: true,
        emailMasked: "al***@sacco.ug",
      })
    })
  })

  describe("completePasswordReset", () => {
    it("rejects short passwords without touching database", async () => {
      const res = await completePasswordReset({ token: "tok", newPassword: "short" })
      expect(res).toEqual({ ok: false, error: "password_too_short" })
      expect(mockRunWithoutAuth).not.toHaveBeenCalled()
    })

    it("rejects expired or unknown tokens and rolls back", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          { rows: [] }, // BEGIN
          { rows: [] }, // SELECT ... FOR UPDATE
          { rows: [] }, // ROLLBACK
        ])
        return fn(client as never)
      })

      const res = await completePasswordReset({ token: "bad", newPassword: "NewPassword123!" })
      expect(res).toEqual({ ok: false, error: "invalid_or_expired_token" })
    })

    it("updates password_hash, marks tokens used, and records audit log", async () => {
      mockRunWithoutAuth.mockImplementation(async (fn) => {
        const client = createClientMock([
          { rows: [] }, // BEGIN
          {
            rows: [
              {
                id: "tok-1",
                auth_user_id: "auth-1",
                used_at: null,
                expires_at: new Date(Date.now() + 60_000).toISOString(),
              },
            ],
          },
          { rows: [], rowCount: 1 }, // UPDATE app_auth_users
          { rows: [], rowCount: 1 }, // UPDATE password_reset_tokens
          {
            rows: [
              {
                institution_id: "inst-1",
                branch_id: "branch-1",
                user_id: "user-1",
              },
            ],
          },
          { rows: [] }, // COMMIT
        ])
        return fn(client as never)
      })

      const res = await completePasswordReset({
        token: "valid-token",
        newPassword: "StrongPassword123",
      })

      expect(res).toEqual({ ok: true })
      expect(mockHash).toHaveBeenCalledWith("StrongPassword123", 10)
      expect(mockAuditLogUpdate).toHaveBeenCalledWith(
        "app_auth_users",
        "auth-1",
        {},
        { password_reset_self_service: true },
        "inst-1",
        "user-1",
        { branch_id: "branch-1" },
      )
    })
  })
})
