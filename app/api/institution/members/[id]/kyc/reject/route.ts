import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { apiLog, getApiPath } from "@/lib/api/api-log"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.kyc.reject.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as { pendingId?: string; reason?: string }
    const pendingId = (body?.pendingId || "").trim()
    const reason = (body?.reason || "").toString().trim().slice(0, 500)
    if (!pendingId) return NextResponse.json({ error: "missing_pending_id" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT
           u.id,
           u.institution_id,
           u.branch_id,
          CASE
            WHEN r.name = 'System Admin' THEN 'system_admin'
            WHEN r.name = 'Super Admin' THEN 'super_admin'
            WHEN r.name = 'Admin' THEN 'institution_admin'
            WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
            ELSE NULL
          END AS app_role
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "forbidden" as const }

      const targetRes = await client.query(
        `SELECT id, institution_id FROM members WHERE id = $1`,
        [memberId]
      )
      const targetMember = targetRes.rows[0]
      if (!targetMember) return { error: "member_not_found" as const }
      const isSystemAdmin = (appUser as { app_role?: string }).app_role === "system_admin"
      if (!isSystemAdmin && targetMember.institution_id !== appUser.institution_id) return { error: "forbidden" as const }

      const pendingRes = await client.query(
        `SELECT id, institution_id, member_id, doc_type, url, status, rejection_reason FROM member_kyc_docs WHERE id = $1`,
        [pendingId]
      )
      const pending = pendingRes.rows[0]
      if (!pending) return { error: "pending_not_found" as const }
      if (pending.member_id !== memberId || (!isSystemAdmin && pending.institution_id !== appUser.institution_id)) {
        return { error: "forbidden" as const }
      }
      if (pending.status !== "pending_review") return { error: "not_pending" as const }

      const oldValues = { status: pending.status, rejection_reason: pending.rejection_reason }

      await client.query(
        `UPDATE member_kyc_docs SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = $3 WHERE id = $4`,
        [reason || null, appUser.id, new Date().toISOString(), pendingId]
      )

      await auditLogger.logUpdate(
        "member_kyc_docs",
        pendingId,
        oldValues,
        { status: "rejected", rejection_reason: reason || null },
        appUser.institution_id,
        appUser.id,
        { branch_id: String(appUser.branch_id || "") },
        client
      )

      const tpl = NotificationTemplates.kycRejected(pending.doc_type as string, reason || "Document did not meet requirements")
      await notificationService.create({
        institutionId: appUser.institution_id,
        branchId: String(appUser.branch_id || ""),
        recipientType: "member",
        recipientId: memberId,
        type: "kyc_rejected",
        title: tpl.title,
        message: tpl.message,
        actionUrl: tpl.actionUrl,
        metadata: { doc_type: pending.doc_type, reason: reason || "" },
      }).catch((e) => console.error("Failed to create KYC rejected notification:", e))

      return { ok: true }
    })

    if (result && "error" in result) {
      const status = result.error === "member_not_found" || result.error === "pending_not_found" ? 404 : 403
      apiLog("warn", "member.kyc.reject.denied", { method: "POST", apiPath, status, error: result.error, memberId, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status })
    }
    apiLog("info", "member.kyc.reject.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.reject.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
