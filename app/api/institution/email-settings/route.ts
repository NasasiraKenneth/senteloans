import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  resolveActorContext,
  hasPermission,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import {
  loadBranchEmailSettings,
  toPublicEmailSettings,
  type PublicEmailSettings,
} from "@/lib/email/settings"
import { EMAIL_PROVIDERS, type EmailProvider } from "@/lib/email/types"

const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

const normalizeProvider = (v: unknown): EmailProvider | null => {
  const p = String(v || "").trim().toLowerCase()
  return (EMAIL_PROVIDERS as readonly string[]).includes(p) ? (p as EmailProvider) : null
}

type PutBody = {
  provider?: string
  fromEmail?: string | null
  replyToEmail?: string | null
  domain?: string | null
  apiKey?: string | null
  smtpHost?: string | null
  smtpPort?: number | null
  smtpUsername?: string | null
  smtpPassword?: string | null
  isActive?: boolean
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id || !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const allowed = await hasPermission(client, actor, "edit_branch_financial_info")
      if (!allowed) return { error: "missing_permission:edit_branch_financial_info" as const }

      const row = await loadBranchEmailSettings(client, actor.branch_id)
      if (!row) {
        const defaults: PublicEmailSettings = {
          provider: "mailgun",
          fromEmail: null,
          replyToEmail: null,
          domain: null,
          smtpHost: null,
          smtpPort: null,
          smtpUsername: null,
          isActive: false,
          hasApiKey: false,
          hasSmtpPassword: false,
          apiKeyMasked: null,
        }
        return { settings: defaults }
      }
      return { settings: toPublicEmailSettings(row) }
    })

    if (result && "error" in result) {
      const status = result.error === "missing_permission:edit_branch_financial_info" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    apiLog("info", "institution.email_settings.get.success", {
      method: "GET",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.email_settings.get.error", {
      method: "GET",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "no_app_user" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as PutBody
    const provider = normalizeProvider(body.provider)
    if (!provider) {
      return NextResponse.json({ error: "invalid_provider" }, { status: 400 })
    }

    const fromEmail = body.fromEmail == null ? null : String(body.fromEmail).trim() || null
    const replyToEmail = body.replyToEmail == null ? null : String(body.replyToEmail).trim() || null
    const domain = body.domain == null ? null : String(body.domain).trim() || null
    const apiKeyInput = body.apiKey == null ? null : String(body.apiKey).trim() || null
    const smtpHost = body.smtpHost == null ? null : String(body.smtpHost).trim() || null
    const smtpPort =
      body.smtpPort == null || body.smtpPort === ("" as unknown)
        ? null
        : Number(body.smtpPort)
    const smtpUsername = body.smtpUsername == null ? null : String(body.smtpUsername).trim() || null
    const smtpPasswordInput =
      body.smtpPassword == null
        ? null
        : String(body.smtpPassword).replace(/\s/g, "").trim() || null
    const isActive = Boolean(body.isActive)

    if (fromEmail && !isEmail(fromEmail)) {
      return NextResponse.json({ error: "invalid_from_email" }, { status: 400 })
    }
    if (replyToEmail && !isEmail(replyToEmail)) {
      return NextResponse.json({ error: "invalid_reply_to_email" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id || !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_branch_financial_info")
      if (!allowed) return { error: "missing_permission:edit_branch_financial_info" as const }

      const existing = await loadBranchEmailSettings(client, actor.branch_id)
      const apiKey = apiKeyInput || existing?.api_key || null
      const smtpPassword = smtpPasswordInput || existing?.smtp_password || null

      if (isActive && provider === "mailgun") {
        if (!fromEmail) return { error: "from_email_required" as const }
        if (!domain) return { error: "domain_required" as const }
        if (!apiKey) return { error: "api_key_required" as const }
      }

      if (isActive && provider === "smtp") {
        if (!fromEmail) return { error: "from_email_required" as const }
        if (!smtpHost) return { error: "smtp_host_required" as const }
        if (!Number.isFinite(smtpPort) || (smtpPort as number) <= 0) {
          return { error: "smtp_port_required" as const }
        }
        if (!smtpUsername) return { error: "smtp_username_required" as const }
        if (!smtpPassword) return { error: "smtp_password_required" as const }
      }

      if (isActive && (provider === "sendgrid" || provider === "ses")) {
        return { error: "provider_not_implemented" as const }
      }

      await client.query(
        `INSERT INTO email_settings (
           institution_id, branch_id, provider, from_email, reply_to_email, domain,
           api_key, smtp_host, smtp_port, smtp_username, smtp_password, is_active, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (branch_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           from_email = EXCLUDED.from_email,
           reply_to_email = EXCLUDED.reply_to_email,
           domain = EXCLUDED.domain,
           api_key = COALESCE(NULLIF(EXCLUDED.api_key, ''), email_settings.api_key),
           smtp_host = EXCLUDED.smtp_host,
           smtp_port = EXCLUDED.smtp_port,
           smtp_username = EXCLUDED.smtp_username,
           smtp_password = COALESCE(NULLIF(EXCLUDED.smtp_password, ''), email_settings.smtp_password),
           is_active = EXCLUDED.is_active,
           updated_at = NOW()`,
        [
          actor.institution_id,
          actor.branch_id,
          provider,
          fromEmail,
          replyToEmail,
          domain,
          apiKey,
          smtpHost,
          Number.isFinite(smtpPort) ? smtpPort : null,
          smtpUsername,
          smtpPassword,
          isActive,
        ],
      )

      const saved = await loadBranchEmailSettings(client, actor.branch_id)
      if (!saved) return { error: "save_failed" as const }
      return { settings: toPublicEmailSettings(saved) }
    })

    if (result && "error" in result) {
      const err = result.error
      const status =
        err === SUPER_ADMIN_WRITE_BLOCKED || err === "missing_permission:edit_branch_financial_info"
          ? 403
          : 400
      const errorText = "message" in result && result.message ? result.message : err
      return NextResponse.json({ error: errorText, code: err }, { status })
    }

    apiLog("info", "institution.email_settings.put.success", {
      method: "PUT",
      apiPath,
      status: 200,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.email_settings.put.error", {
      method: "PUT",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
