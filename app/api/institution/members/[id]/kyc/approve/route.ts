import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { apiLog, getApiPath } from "@/lib/api/api-log"

const COLUMN_MAP: Record<string, string> = {
  passport_photo: "passport_photo",
  national_id_front: "national_id_front",
  national_id_back: "national_id_back",
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.kyc.approve.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as { pendingId?: string }
    const pendingId = (body?.pendingId || "").trim()
    if (!pendingId) return NextResponse.json({ error: "missing_pending_id" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT
           u.id,
           u.institution_id,
          CASE
            WHEN r.name = 'System Admin' THEN 'system_admin'
            WHEN r.name = 'Super Admin' THEN 'super_admin'
            WHEN r.name = 'Admin' THEN 'institution_admin'
            WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
            ELSE NULL
          END AS app_role
         FROM senteloans_users u
         LEFT JOIN senteloans_roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "forbidden" as const }

      const targetRes = await client.query(
        `SELECT id, institution_id, passport_photo, national_id_front, national_id_back FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const targetMember = targetRes.rows[0]
      if (!targetMember) return { error: "member_not_found" as const }
      const isSystemAdmin = (appUser as { app_role?: string }).app_role === "system_admin"
      if (!isSystemAdmin && targetMember.institution_id !== appUser.institution_id) return { error: "forbidden" as const }

      const pendingRes = await client.query(
        `SELECT id, institution_id, member_id, doc_type, url, status FROM senteloans_member_kyc_docs WHERE id = $1`,
        [pendingId]
      )
      const pending = pendingRes.rows[0]
      if (!pending) return { error: "pending_not_found" as const }
      if (pending.member_id !== memberId || (!isSystemAdmin && pending.institution_id !== appUser.institution_id)) {
        return { error: "forbidden" as const }
      }
      if (pending.status !== "pending_review") return { error: "not_pending" as const }

      const column = COLUMN_MAP[pending.doc_type as string]
      if (!column) return { error: "invalid_doc_type" as const }

      const oldValues = { [column]: (targetMember as Record<string, unknown>)[column] }

      await client.query(
        `UPDATE senteloans_members SET ${column} = $1 WHERE id = $2 AND institution_id = $3`,
        [pending.url, memberId, appUser.institution_id]
      )

      await client.query(
        `UPDATE senteloans_member_kyc_docs SET status = 'superseded' WHERE member_id = $1 AND doc_type = $2 AND status = 'verified'`,
        [memberId, pending.doc_type]
      )

      await client.query(
        `UPDATE senteloans_member_kyc_docs SET status = 'verified', reviewed_by = $1, reviewed_at = $2 WHERE id = $3`,
        [appUser.id, new Date().toISOString(), pendingId]
      )

      await auditLogger.logUpdate(
        "senteloans_members",
        memberId,
        oldValues,
        { [column]: pending.url },
        appUser.institution_id,
        appUser.id,
        undefined,
        client
      )

      const tpl = NotificationTemplates.kycApproved(pending.doc_type as string)
      await notificationService.create({
        institutionId: appUser.institution_id,
        recipientType: "member",
        recipientId: memberId,
        type: "kyc_approved",
        title: tpl.title,
        message: tpl.message,
        actionUrl: tpl.actionUrl,
        metadata: { doc_type: pending.doc_type },
      }).catch((e) => console.error("Failed to create KYC approved notification:", e))

      return { ok: true, column, url: pending.url }
    })

    if (result && "error" in result) {
      const status = result.error === "member_not_found" || result.error === "pending_not_found" ? 404 : 403
      apiLog("warn", "member.kyc.approve.denied", { method: "POST", apiPath, status, error: result.error, memberId, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.kyc.approve.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.approve.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
