import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"

const DOC_TYPES = ["passport_photo", "national_id_front", "national_id_back"] as const
type DocType = (typeof DOC_TYPES)[number]

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const payload = (await req.json().catch(() => ({}))) as { docType?: string; url?: string }
    const docType = payload.docType as DocType | undefined
    const url = typeof payload.url === "string" ? payload.url.trim() : ""
    if (!docType || !DOC_TYPES.includes(docType)) return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 })
    if (!url) return NextResponse.json({ error: "url_required" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id FROM senteloans_clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const insertRes = await client.query(
        `INSERT INTO senteloans_client_kyc_docs (institution_id, client_id, doc_type, url, status) VALUES ($1, $2, $3, $4, 'pending_review') RETURNING id, created_at`,
        [row.institution_id, row.id, docType, url]
      )
      const inserted = insertRes.rows[0]
      if (!inserted) return null

      const insertPayload = { institution_id: row.institution_id, client_id: row.id, doc_type: docType, url, status: "pending_review" }
      await auditLogger.logInsert(
        "senteloans_client_kyc_docs",
        inserted.id,
        insertPayload,
        row.institution_id,
        undefined,
        { branch_id: String(row.branch_id || "") },
        client
      )

      const clientInfoRes = await client.query(`SELECT full_name FROM senteloans_clients WHERE id = $1`, [row.id])
      const clientInfo = clientInfoRes.rows[0]
      const adminsRes = await client.query(
        `SELECT id FROM senteloans_users WHERE institution_id = $1 AND role IN ('institution_admin', 'manager', 'loan_officer')`,
        [row.institution_id]
      )
      const admins = adminsRes.rows
      if (admins.length > 0 && clientInfo) {
        const tpl = NotificationTemplates.pendingKycReview((clientInfo as { full_name: string }).full_name, docType, row.id)
        await notificationService.createBulk(
          admins.map((a: { id: string }) => ({
            institutionId: row.institution_id,
            branchId: String(row.branch_id || ""),
            recipientType: "institution_user" as const,
            recipientId: a.id,
            type: "pending_kyc_review" as const,
            title: tpl.title,
            message: tpl.message,
            actionUrl: tpl.actionUrl,
            metadata: { client_id: row.id, client_name: (clientInfo as { full_name: string }).full_name, doc_type: docType },
          })),
          client
        )
      }
      return { ok: true, pendingId: inserted.id }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
