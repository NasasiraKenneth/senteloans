import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notifyKycSubmitted } from "@/lib/notifications/kyc-events"
import { enqueueKycSubmittedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"
import { apiLog, getApiPath } from "@/lib/api/api-log"

const DOC_TYPES = ["passport_photo", "national_id_front", "national_id_back"] as const
type DocType = (typeof DOC_TYPES)[number]

type KycSubmitPostCommit = {
  institutionId: string
  branchId: string
  institutionName: string
  member: {
    id: string
    full_name: string
    member_number: string
    email: string
  }
  docType: string
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, kyc_status, passport_photo, national_id_front, national_id_back, updated_at FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const docsRes = await client.query(
        `SELECT id, doc_type, url, status, rejection_reason, created_at, reviewed_at FROM member_kyc_docs WHERE member_id = $1 ORDER BY created_at DESC`,
        [row.id]
      )
      const kycDocs = docsRes.rows

      const result: Record<DocType, { current_verified: { url: string; verified_at: string } | null; pending: { id: string; url: string; submitted_at: string } | null; last_rejection: { reason: string | null; date: string } | null }> = {
        passport_photo: { current_verified: row.passport_photo ? { url: row.passport_photo, verified_at: row.updated_at } : null, pending: null, last_rejection: null },
        national_id_front: { current_verified: row.national_id_front ? { url: row.national_id_front, verified_at: row.updated_at } : null, pending: null, last_rejection: null },
        national_id_back: { current_verified: row.national_id_back ? { url: row.national_id_back, verified_at: row.updated_at } : null, pending: null, last_rejection: null },
      }
      for (const t of DOC_TYPES) {
        const byType = kycDocs.filter((d: { doc_type: string }) => d.doc_type === t)
        const pending = byType.find((d: { status: string }) => d.status === "pending_review")
        const lastRejected = byType.find((d: { status: string }) => d.status === "rejected")
        if (pending) result[t].pending = { id: pending.id, url: pending.url, submitted_at: pending.created_at }
        if (lastRejected) result[t].last_rejection = { reason: lastRejected.rejection_reason, date: lastRejected.reviewed_at || lastRejected.created_at }
      }
      return { ok: true, kycStatus: row.kyc_status, docs: result }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const payload = (await req.json().catch(() => ({}))) as { docType?: string; url?: string }
    const docType = payload.docType as DocType | undefined
    const url = typeof payload.url === "string" ? payload.url.trim() : ""
    if (!docType || !DOC_TYPES.includes(docType)) return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 })
    if (!url) return NextResponse.json({ error: "url_required" }, { status: 400 })

    let postCommit: KycSubmitPostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id, full_name, member_number, email FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const insertRes = await client.query(
        `INSERT INTO member_kyc_docs (institution_id, branch_id, member_id, doc_type, url, status) VALUES ($1, $2, $3, $4, $5, 'pending_review') RETURNING id, created_at`,
        [row.institution_id, row.branch_id, row.id, docType, url]
      )
      const inserted = insertRes.rows[0]
      if (!inserted) return null

      const insertPayload = { institution_id: row.institution_id, branch_id: row.branch_id, member_id: row.id, doc_type: docType, url, status: "pending_review" }
      await auditLogger.logInsert(
        "member_kyc_docs",
        inserted.id,
        insertPayload,
        row.institution_id,
        undefined,
        { branch_id: String(row.branch_id || "") },
        client
      )

      await notifyKycSubmitted({
        client,
        institutionId: row.institution_id,
        branchId: String(row.branch_id || ""),
        member: {
          id: row.id,
          full_name: String(row.full_name || ""),
          member_number: row.member_number ? String(row.member_number) : "",
        },
        docType,
      })

      const instRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1`,
        [row.institution_id],
      )

      postCommit = {
        institutionId: row.institution_id,
        branchId: String(row.branch_id || ""),
        institutionName: instRes.rows[0]?.name || "",
        member: {
          id: String(row.id),
          full_name: String(row.full_name || ""),
          member_number: row.member_number ? String(row.member_number) : "",
          email: row.email ? String(row.email) : "",
        },
        docType,
      }

      return { ok: true, pendingId: inserted.id }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })

    const ctx = postCommit as KycSubmitPostCommit | null
    if (ctx) {
      try {
        const emailContext: KycEmailContext = {
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
        }
        const emailRes = await enqueueKycSubmittedEmail({
          member: ctx.member,
          institutionName: ctx.institutionName,
          docType: ctx.docType,
          context: emailContext,
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "client.kyc.submit.email_enqueue_partial", {
            method: "POST", apiPath, status: 200, memberId: ctx.member.id, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "client.kyc.submit.email_enqueue_failed", {
          method: "POST", apiPath, status: 200, memberId: ctx.member.id,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
