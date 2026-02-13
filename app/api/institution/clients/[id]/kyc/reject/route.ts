import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { pendingId?: string; reason?: string }
    const pendingId = (body?.pendingId || "").trim()
    const reason = (body?.reason || "").toString().trim().slice(0, 500)
    if (!pendingId) return NextResponse.json({ error: "missing_pending_id" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id, role FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "forbidden" as const }

      const targetRes = await client.query(
        `SELECT id, institution_id FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const targetClient = targetRes.rows[0]
      if (!targetClient) return { error: "client_not_found" as const }
      const isSystemAdmin = (appUser as { role?: string }).role === "system_admin"
      if (!isSystemAdmin && targetClient.institution_id !== appUser.institution_id) return { error: "forbidden" as const }

      const pendingRes = await client.query(
        `SELECT id, institution_id, client_id, doc_type, url, status, rejection_reason FROM senteloans_client_kyc_docs WHERE id = $1`,
        [pendingId]
      )
      const pending = pendingRes.rows[0]
      if (!pending) return { error: "pending_not_found" as const }
      if (pending.client_id !== clientId || (!isSystemAdmin && pending.institution_id !== appUser.institution_id)) {
        return { error: "forbidden" as const }
      }
      if (pending.status !== "pending_review") return { error: "not_pending" as const }

      const oldValues = { status: pending.status, rejection_reason: pending.rejection_reason }

      await client.query(
        `UPDATE senteloans_client_kyc_docs SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = $3 WHERE id = $4`,
        [reason || null, appUser.id, new Date().toISOString(), pendingId]
      )

      await auditLogger.logUpdate(
        "senteloans_client_kyc_docs",
        pendingId,
        oldValues,
        { status: "rejected", rejection_reason: reason || null },
        appUser.institution_id,
        appUser.id,
        undefined,
        client
      )

      const tpl = NotificationTemplates.kycRejected(pending.doc_type as string, reason || "Document did not meet requirements")
      await notificationService.create({
        institutionId: appUser.institution_id,
        recipientType: "client",
        recipientId: clientId,
        type: "kyc_rejected",
        title: tpl.title,
        message: tpl.message,
        actionUrl: tpl.actionUrl,
        metadata: { doc_type: pending.doc_type, reason: reason || "" },
      }).catch((e) => console.error("Failed to create KYC rejected notification:", e))

      return { ok: true }
    })

    if (result && "error" in result) {
      const status = result.error === "client_not_found" || result.error === "pending_not_found" ? 404 : 403
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
