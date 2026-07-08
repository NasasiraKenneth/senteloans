import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notifyKycSubmitted } from "@/lib/notifications/kyc-events"
import { enqueueKycSubmittedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  buildLegacyClientKycDocs,
  buildMemberKycSnapshot,
  isKycUploadField,
  kycUploadHint,
  type KycUploadField,
  type MemberKycDocRow,
  upsertKycDocField,
} from "@/lib/members/kyc-docs"

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
        `SELECT id, institution_id, kyc_status FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const docsRes = await client.query<MemberKycDocRow>(
        `SELECT id, doc_type, passport_photo, document_front, document_back, status, rejection_reason, created_at, reviewed_at
         FROM member_kyc_docs
         WHERE member_id = $1
         ORDER BY created_at DESC`,
        [row.id]
      )

      const snapshot = buildMemberKycSnapshot(docsRes.rows, "staff")
      const kycRow = docsRes.rows[0] || null
      return {
        ok: true,
        kycStatus: row.kyc_status,
        docType: snapshot.docType,
        docStatus: snapshot.docStatus,
        docComplete: snapshot.docComplete,
        uploadHint: kycUploadHint(snapshot.docType),
        formDocs: snapshot.formDocs,
        kycRow,
        docs: buildLegacyClientKycDocs(docsRes.rows),
      }
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
    const docType = payload.docType
    const url = typeof payload.url === "string" ? payload.url.trim() : ""
    if (!docType || !isKycUploadField(docType)) return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 })
    if (!url) return NextResponse.json({ error: "url_required" }, { status: 400 })

    let postCommit: KycSubmitPostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id, full_name, member_number, email FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const saved = await upsertKycDocField(client, {
        memberId: row.id,
        institutionId: row.institution_id,
        branchId: String(row.branch_id || ""),
        field: docType as KycUploadField,
        url,
        status: "pending_review",
      })

      const insertPayload = {
        institution_id: row.institution_id,
        branch_id: row.branch_id,
        member_id: row.id,
        doc_type: saved.docType,
        status: "pending_review",
      }
      await auditLogger.logInsert(
        "member_kyc_docs",
        saved.docId,
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

      return { ok: true, pendingId: saved.docId }
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
