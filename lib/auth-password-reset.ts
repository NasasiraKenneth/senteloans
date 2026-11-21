import crypto from "crypto"
import { hash } from "bcryptjs"
import type { PoolClient } from "pg"
import { runWithoutAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { enqueueEmail, type EmailJobData } from "@/queues/email.queue"
import { sendTransactionalEmail } from "@/lib/email/sender"
import { renderEmailTemplate } from "@/lib/email/render-template"
import { resolvePlatformMailgunConfig, sendMailgunMessage } from "@/lib/email/providers/mailgun"

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60
export const PASSWORD_RESET_MIN_LENGTH = 8
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60

export function hashPasswordResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex")
}

export function generatePasswordResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex")
  return { rawToken, tokenHash: hashPasswordResetToken(rawToken) }
}

export function maskEmail(email: string): string {
  const trimmed = String(email || "").trim().toLowerCase()
  const atIndex = trimmed.indexOf("@")
  if (atIndex <= 0) return "***"
  const local = trimmed.slice(0, atIndex)
  const domain = trimmed.slice(atIndex + 1)
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }
  return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 5))}@${domain}`
}

function normalizeBaseUrl(candidate?: string | null): string | null {
  const trimmed = String(candidate || "").trim()
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed.replace(/\/+$/, "")
}

export function buildPasswordResetUrl(rawToken: string, origin?: string | null): string {
  const base =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.NEXTAUTH_URL) ||
    normalizeBaseUrl(origin) ||
    "http://localhost:3000"
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`
}

type AccountContext = {
  authUserId: string
  email: string
  userType: string | null
  recipientName: string
  institutionId: string | null
  branchId: string | null
  institutionName: string
  institutionLogo: string | null
  actorId: string | null
}

async function resolveAccountContextByEmail(
  client: PoolClient,
  normalizedEmail: string,
): Promise<AccountContext | null> {
  const authRes = await client.query<{ id: string; email: string; user_type: string | null }>(
    `SELECT id, email, user_type
       FROM app_auth_users
      WHERE LOWER(email) = $1
      LIMIT 1`,
    [normalizedEmail],
  )
  const authRow = authRes.rows[0]
  if (!authRow) return null

  const [staffRes, memberRes] = await Promise.all([
    client.query<{
      id: string
      full_name: string
      institution_id: string | null
      branch_id: string | null
      institution_name: string | null
      institution_logo: string | null
    }>(
      `SELECT
         u.id,
         u.full_name,
         u.institution_id,
         u.branch_id,
         i.name AS institution_name,
         i.logo AS institution_logo
       FROM users u
       LEFT JOIN institutions i ON i.id = u.institution_id
       WHERE u.auth_id = $1 AND u.status = 'Active'
       LIMIT 1`,
      [authRow.id],
    ),
    client.query<{
      id: string
      full_name: string
      institution_id: string | null
      branch_id: string | null
      institution_name: string | null
      institution_logo: string | null
    }>(
      `SELECT
         m.id,
         m.full_name,
         m.institution_id,
         m.branch_id,
         i.name AS institution_name,
         i.logo AS institution_logo
       FROM members m
       LEFT JOIN institutions i ON i.id = m.institution_id
       WHERE m.auth_id = $1 AND m.status = 'Active'
       LIMIT 1`,
      [authRow.id],
    ),
  ])

  const staff = staffRes.rows[0] || null
  const member = memberRes.rows[0] || null
  const isSystemAdmin = authRow.user_type === "system_admin"

  if (!staff && !member && !isSystemAdmin) {
    return null
  }

  const primary = staff || member
  return {
    authUserId: authRow.id,
    email: authRow.email,
    userType: authRow.user_type,
    recipientName: primary?.full_name || "User",
    institutionId: primary?.institution_id ?? null,
    branchId: primary?.branch_id ?? null,
    institutionName: primary?.institution_name || "NYUKI",
    institutionLogo: primary?.institution_logo ?? null,
    actorId: staff?.id ?? null,
  }
}

async function dispatchPasswordResetEmail(
  account: AccountContext,
  resetUrl: string,
): Promise<boolean> {
  const subject = `Reset your ${account.institutionName} password`
  const templateData = {
    recipientName: account.recipientName,
    institutionName: account.institutionName,
    institutionLogo: account.institutionLogo,
    resetUrl,
    expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
  }

  if (account.branchId) {
    const job: EmailJobData = {
      to: account.email,
      subject,
      template: "auth.password_reset",
      kind: "template",
      data: templateData,
      context: {
        institutionId: account.institutionId ?? undefined,
        branchId: account.branchId,
        actorId: account.actorId ?? undefined,
      },
    }

    try {
      await enqueueEmail(job)
      return true
    } catch (queueErr) {
      console.warn(
        "[auth-password-reset] Failed to enqueue reset email, attempting direct send:",
        (queueErr as Error)?.message || queueErr,
      )
      const direct = await sendTransactionalEmail(job)
      return direct.ok
    }
  }

  const platform = resolvePlatformMailgunConfig()
  if (!platform) {
    console.warn("[auth-password-reset] No branch or platform Mailgun config available to send reset email")
    return false
  }

  const rendered = renderEmailTemplate("auth.password_reset", templateData)
  const sent = await sendMailgunMessage({
    apiKey: platform.apiKey,
    domain: platform.domain,
    from: platform.from,
    to: account.email,
    subject,
    text: rendered.text,
    html: rendered.html,
  })
  return sent.ok
}

export type RequestPasswordResetResult = {
  ok: true
  dispatched: boolean
  rateLimited?: boolean
}

export async function requestPasswordReset(params: {
  email: string
  origin?: string | null
  requestedIp?: string | null
}): Promise<RequestPasswordResetResult> {
  const normalizedEmail = String(params.email || "").trim().toLowerCase()
  if (!normalizedEmail) {
    return { ok: true, dispatched: false }
  }

  const issued = await runWithoutAuth(async (client) => {
    const account = await resolveAccountContextByEmail(client, normalizedEmail)
    if (!account) {
      return { status: "not_found" as const }
    }

    const recentRes = await client.query<{ id: string }>(
      `SELECT id
         FROM password_reset_tokens
        WHERE auth_user_id = $1
          AND used_at IS NULL
          AND expires_at > NOW()
          AND created_at > NOW() - ($2::int * INTERVAL '1 second')
        LIMIT 1`,
      [account.authUserId, PASSWORD_RESET_COOLDOWN_SECONDS],
    )
    if ((recentRes.rowCount ?? 0) > 0) {
      return { status: "rate_limited" as const }
    }

    const { rawToken, tokenHash } = generatePasswordResetToken()

    await client.query("BEGIN")
    try {
      await client.query(
        `UPDATE password_reset_tokens
            SET used_at = NOW()
          WHERE auth_user_id = $1
            AND used_at IS NULL`,
        [account.authUserId],
      )

      await client.query(
        `INSERT INTO password_reset_tokens (auth_user_id, token_hash, expires_at, requested_ip)
         VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 minute'), $4)`,
        [
          account.authUserId,
          tokenHash,
          PASSWORD_RESET_TOKEN_TTL_MINUTES,
          params.requestedIp ? params.requestedIp.slice(0, 64) : null,
        ],
      )

      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }

    return { status: "issued" as const, account, rawToken }
  })

  if (issued.status === "not_found") {
    return { ok: true, dispatched: false }
  }

  if (issued.status === "rate_limited") {
    return { ok: true, dispatched: false, rateLimited: true }
  }

  const resetUrl = buildPasswordResetUrl(issued.rawToken, params.origin)
  const dispatched = await dispatchPasswordResetEmail(issued.account, resetUrl)
  return { ok: true, dispatched }
}

export type ValidateResetTokenResult =
  | { valid: true; emailMasked: string }
  | { valid: false; reason: "missing" | "invalid" | "used" | "expired" }

export async function validatePasswordResetToken(
  rawToken: string,
): Promise<ValidateResetTokenResult> {
  const token = String(rawToken || "").trim()
  if (!token) {
    return { valid: false, reason: "missing" }
  }

  const tokenHash = hashPasswordResetToken(token)

  return runWithoutAuth(async (client) => {
    const res = await client.query<{
      email: string
      used_at: Date | string | null
      expires_at: Date | string
    }>(
      `SELECT a.email, t.used_at, t.expires_at
         FROM password_reset_tokens t
         JOIN app_auth_users a ON a.id = t.auth_user_id
        WHERE t.token_hash = $1
        LIMIT 1`,
      [tokenHash],
    )

    const row = res.rows[0]
    if (!row) return { valid: false, reason: "invalid" }
    if (row.used_at) return { valid: false, reason: "used" }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { valid: false, reason: "expired" }
    }

    return { valid: true, emailMasked: maskEmail(row.email) }
  })
}

export type CompletePasswordResetResult =
  | { ok: true }
  | { ok: false; error: "token_required" | "password_too_short" | "invalid_or_expired_token" }

export async function completePasswordReset(params: {
  token: string
  newPassword: string
}): Promise<CompletePasswordResetResult> {
  const rawToken = String(params.token || "").trim()
  const newPassword = typeof params.newPassword === "string" ? params.newPassword : ""

  if (!rawToken) {
    return { ok: false, error: "token_required" }
  }
  if (newPassword.length < PASSWORD_RESET_MIN_LENGTH) {
    return { ok: false, error: "password_too_short" }
  }

  const tokenHash = hashPasswordResetToken(rawToken)
  const passwordHash = await hash(newPassword, 10)

  const outcome = await runWithoutAuth(async (client) => {
    await client.query("BEGIN")
    try {
      const tokenRes = await client.query<{
        id: string
        auth_user_id: string
        used_at: Date | string | null
        expires_at: Date | string
      }>(
        `SELECT id, auth_user_id, used_at, expires_at
           FROM password_reset_tokens
          WHERE token_hash = $1
          FOR UPDATE`,
        [tokenHash],
      )

      const row = tokenRes.rows[0]
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK")
        return { ok: false as const, error: "invalid_or_expired_token" as const }
      }

      await client.query(
        `UPDATE app_auth_users
            SET password_hash = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [passwordHash, row.auth_user_id],
      )

      await client.query(
        `UPDATE password_reset_tokens
            SET used_at = NOW()
          WHERE auth_user_id = $1
            AND used_at IS NULL`,
        [row.auth_user_id],
      )

      const scopeRes = await client.query<{
        institution_id: string | null
        branch_id: string | null
        user_id: string | null
      }>(
        `SELECT
           COALESCE(u.institution_id, m.institution_id) AS institution_id,
           COALESCE(u.branch_id, m.branch_id) AS branch_id,
           u.id AS user_id
         FROM app_auth_users a
         LEFT JOIN users u ON u.auth_id = a.id
         LEFT JOIN members m ON m.auth_id = a.id
         WHERE a.id = $1
         LIMIT 1`,
        [row.auth_user_id],
      )

      await client.query("COMMIT")

      return {
        ok: true as const,
        authUserId: row.auth_user_id,
        scope: scopeRes.rows[0] || null,
      }
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })

  if (!outcome.ok) {
    return outcome
  }

  if (outcome.scope?.institution_id && outcome.scope?.branch_id) {
    await auditLogger
      .logUpdate(
        "app_auth_users",
        outcome.authUserId,
        {},
        { password_reset_self_service: true },
        outcome.scope.institution_id,
        outcome.scope.user_id ?? undefined,
        { branch_id: outcome.scope.branch_id },
      )
      .catch(() => null)
  }

  return { ok: true }
}
