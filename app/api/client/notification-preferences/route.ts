import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import type { NotificationType } from "@/lib/notifications/notification-types"
import { MEMBER_TRANSACTIONAL_EMAIL_TYPES } from "@/lib/email/seed-member-preferences"

const MEMBER_EMAIL_PREF_TYPES = new Set<string>(MEMBER_TRANSACTIONAL_EMAIL_TYPES)

type PreferenceRow = {
  notification_type: string
  in_app_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
}

type PatchBody = {
  preferences?: Array<{
    notificationType: string
    emailEnabled?: boolean
    inAppEnabled?: boolean
    smsEnabled?: boolean
  }>
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const memberId = session.user.memberId || session.user.clientId
    if (session.user.type !== "client" || !memberId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const memberRes = await client.query<{ institution_id: string; branch_id: string }>(
        `SELECT institution_id, branch_id FROM members WHERE id = $1 LIMIT 1`,
        [memberId],
      )
      const member = memberRes.rows[0]
      if (!member) return { error: "member_not_found" as const }

      const prefRes = await client.query<PreferenceRow>(
        `SELECT notification_type, in_app_enabled, sms_enabled, email_enabled
         FROM notification_preferences
         WHERE user_id = $1 AND user_type = 'member'`,
        [memberId],
      )
      const byType = new Map(prefRes.rows.map((r) => [r.notification_type, r]))

      const preferences = MEMBER_TRANSACTIONAL_EMAIL_TYPES.map((notificationType) => {
        const row = byType.get(notificationType)
        return {
          notificationType,
          inAppEnabled: row?.in_app_enabled ?? true,
          smsEnabled: row?.sms_enabled ?? false,
          emailEnabled: row?.email_enabled ?? true,
        }
      })

      return { preferences }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const memberId = session.user.memberId || session.user.clientId
    if (session.user.type !== "client" || !memberId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody
    const updates = Array.isArray(body.preferences) ? body.preferences : []
    if (updates.length === 0) {
      return NextResponse.json({ error: "preferences_required" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const memberRes = await client.query<{ institution_id: string; branch_id: string }>(
        `SELECT institution_id, branch_id FROM members WHERE id = $1 LIMIT 1`,
        [memberId],
      )
      const member = memberRes.rows[0]
      if (!member) return { error: "member_not_found" as const }

      for (const item of updates) {
        const notificationType = String(item.notificationType || "").trim()
        if (!MEMBER_EMAIL_PREF_TYPES.has(notificationType)) {
          return { error: "invalid_notification_type" as const }
        }

        const emailEnabled = item.emailEnabled !== false
        const inAppEnabled = item.inAppEnabled !== false
        const smsEnabled = Boolean(item.smsEnabled)

        await client.query(
          `INSERT INTO notification_preferences (
             institution_id, branch_id, user_type, user_id,
             notification_type, in_app_enabled, sms_enabled, email_enabled
           ) VALUES ($1, $2, 'member', $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, notification_type) DO UPDATE SET
             email_enabled = EXCLUDED.email_enabled,
             in_app_enabled = EXCLUDED.in_app_enabled,
             sms_enabled = EXCLUDED.sms_enabled,
             updated_at = NOW()`,
          [
            member.institution_id,
            member.branch_id,
            memberId,
            notificationType as NotificationType,
            inAppEnabled,
            smsEnabled,
            emailEnabled,
          ],
        )
      }

      return { ok: true as const }
    })

    if (result && "error" in result) {
      const status = result.error === "invalid_notification_type" ? 400 : 404
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
