import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  completePasswordReset,
  PASSWORD_RESET_MIN_LENGTH,
  validatePasswordResetToken,
} from "@/lib/auth-password-reset"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token") || ""
    const check = await validatePasswordResetToken(token)

    if (!check.valid) {
      const message =
        check.reason === "expired"
          ? "This password reset link has expired. Please request a new one."
          : check.reason === "used"
            ? "This password reset link has already been used. Please request a new one."
            : "This password reset link is invalid. Please request a new one."
      return NextResponse.json(
        { valid: false, reason: check.reason, message },
        { status: 400 },
      )
    }

    return NextResponse.json({
      valid: true,
      emailMasked: check.emailMasked,
    })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "auth.reset_password.validate_error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json(
      { valid: false, error: "server_error", message: "Unable to verify reset link." },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown
      newPassword?: unknown
      confirmPassword?: unknown
    }

    const token = typeof body?.token === "string" ? body.token.trim() : ""
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : ""
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : undefined

    if (!token) {
      return NextResponse.json(
        { error: "token_required", message: "Reset token is required." },
        { status: 400 },
      )
    }

    if (newPassword.length < PASSWORD_RESET_MIN_LENGTH) {
      return NextResponse.json(
        {
          error: "password_too_short",
          message: `Password must be at least ${PASSWORD_RESET_MIN_LENGTH} characters long.`,
        },
        { status: 400 },
      )
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "password_mismatch", message: "Passwords do not match." },
        { status: 400 },
      )
    }

    const result = await completePasswordReset({ token, newPassword })

    if (!result.ok) {
      const message =
        result.error === "password_too_short"
          ? `Password must be at least ${PASSWORD_RESET_MIN_LENGTH} characters long.`
          : "This password reset link is invalid or has expired. Please request a new one."
      return NextResponse.json({ error: result.error, message }, { status: 400 })
    }

    apiLog("info", "auth.reset_password.completed", {
      method: "POST",
      apiPath,
      status: 200,
    })

    return NextResponse.json({
      ok: true,
      message: "Your password has been reset successfully. You can now sign in.",
    })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "auth.reset_password.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json(
      { error: "server_error", message: "Unable to reset password right now." },
      { status: 500 },
    )
  }
}
