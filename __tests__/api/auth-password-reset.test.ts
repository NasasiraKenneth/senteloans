import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route"
import {
  GET as resetPasswordGET,
  POST as resetPasswordPOST,
} from "@/app/api/auth/reset-password/route"
import {
  completePasswordReset,
  requestPasswordReset,
  validatePasswordResetToken,
} from "@/lib/auth-password-reset"

jest.mock("@/lib/auth-password-reset", () => ({
  PASSWORD_RESET_MIN_LENGTH: 8,
  requestPasswordReset: jest.fn(),
  validatePasswordResetToken: jest.fn(),
  completePasswordReset: jest.fn(),
}))

const mockRequestPasswordReset = requestPasswordReset as jest.MockedFunction<
  typeof requestPasswordReset
>
const mockValidatePasswordResetToken = validatePasswordResetToken as jest.MockedFunction<
  typeof validatePasswordResetToken
>
const mockCompletePasswordReset = completePasswordReset as jest.MockedFunction<
  typeof completePasswordReset
>

describe("Auth Password Reset API routes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("POST /api/auth/forgot-password", () => {
    it("returns 400 for missing or invalid email", async () => {
      const req = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      })

      const res = await forgotPasswordPOST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("invalid_email")
      expect(mockRequestPasswordReset).not.toHaveBeenCalled()
    })

    it("returns generic 200 success message regardless of whether account exists", async () => {
      mockRequestPasswordReset.mockResolvedValueOnce({ ok: true, dispatched: false })

      const req = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "https://sacco.ug" },
        body: JSON.stringify({ email: "Alice@Example.com" }),
      })

      const res = await forgotPasswordPOST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.message).toContain("If an account exists")
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: "alice@example.com",
        origin: "https://sacco.ug",
        requestedIp: null,
      })
    })
  })

  describe("GET /api/auth/reset-password", () => {
    it("returns 400 when token is expired", async () => {
      mockValidatePasswordResetToken.mockResolvedValueOnce({ valid: false, reason: "expired" })

      const req = new Request("http://localhost:3000/api/auth/reset-password?token=oldtok")
      const res = await resetPasswordGET(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.valid).toBe(false)
      expect(body.reason).toBe("expired")
    })

    it("returns 200 with masked email when token is valid", async () => {
      mockValidatePasswordResetToken.mockResolvedValueOnce({
        valid: true,
        emailMasked: "al***@sacco.ug",
      })

      const req = new Request("http://localhost:3000/api/auth/reset-password?token=goodtok")
      const res = await resetPasswordGET(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ valid: true, emailMasked: "al***@sacco.ug" })
    })
  })

  describe("POST /api/auth/reset-password", () => {
    it("returns 400 when passwords do not match", async () => {
      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "tok123",
          newPassword: "Password123!",
          confirmPassword: "DifferentPassword!",
        }),
      })

      const res = await resetPasswordPOST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("password_mismatch")
      expect(mockCompletePasswordReset).not.toHaveBeenCalled()
    })

    it("returns 400 when password is shorter than 8 characters", async () => {
      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "tok123",
          newPassword: "short",
          confirmPassword: "short",
        }),
      })

      const res = await resetPasswordPOST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("password_too_short")
    })

    it("returns 400 when token is invalid or expired", async () => {
      mockCompletePasswordReset.mockResolvedValueOnce({
        ok: false,
        error: "invalid_or_expired_token",
      })

      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "expiredtok",
          newPassword: "NewPassword123!",
          confirmPassword: "NewPassword123!",
        }),
      })

      const res = await resetPasswordPOST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("invalid_or_expired_token")
    })

    it("returns 200 when password reset succeeds", async () => {
      mockCompletePasswordReset.mockResolvedValueOnce({ ok: true })

      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "validtok",
          newPassword: "NewPassword123!",
          confirmPassword: "NewPassword123!",
        }),
      })

      const res = await resetPasswordPOST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(mockCompletePasswordReset).toHaveBeenCalledWith({
        token: "validtok",
        newPassword: "NewPassword123!",
      })
    })
  })
})
