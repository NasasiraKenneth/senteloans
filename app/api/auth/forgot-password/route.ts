import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { requestPasswordReset } from "@/lib/auth-password-reset"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email address, we've sent password reset instructions."

function extractRequestOrigin(req: Request): string | null {
  const originHeader = req.headers.get("origin")
  if (originHeader) return originHeader
  try {
    return new URL(req.url).origin
  } catch {
    return null
  }
}

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || null
  return req.headers.get("x-real-ip") || null
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: unknown }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "invalid_email", message: "Please enter a valid email address." },
        { status: 400 },
      )
    }

    const result = await requestPasswordReset({
      email,
      origin: extractRequestOrigin(req),
      requestedIp: extractClientIp(req),
    })

    apiLog("info", "auth.forgot_password.requested", {
      method: "POST",
      apiPath,
      status: 200,
      dispatched: result.dispatched,
      rateLimited: Boolean(result.rateLimited),
    })

    return NextResponse.json({
      ok: true,
      message: GENERIC_SUCCESS_MESSAGE,
    })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "auth.forgot_password.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json(
      { error: "server_error", message: "Unable to process password reset request right now." },
      { status: 500 },
    )
  }
}
