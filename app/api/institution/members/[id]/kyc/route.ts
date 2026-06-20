import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertMemberAndBranchActive,
  isMemberRouteDenial,
  memberRouteDenialBody,
  memberWriteGateHttpStatus,
  memberWriteGateRouteError,
} from "@/lib/members/member-status"
import { notifyKycUploaded } from "@/lib/notifications/kyc-events"
import { enqueueKycUploadedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import {
  fetchStaffMemberKycFormDocs,
  isMemberKycDocSetComplete,
  parseKycUploadPayload,
  type KycDocType,
  type MemberKycDocRow,
  upsertKycDocFields,
} from "@/lib/members/kyc-docs"

type KycStaffUploadPostCommit = {
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  member: {
    id: string
    full_name: string
    member_number: string
    email: string
  }
  docType: KycDocType
  readyForReview: boolean
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "forbidden" as const }

      const allowed = await hasPermission(client, actor, "view_members")
      if (!allowed) return { error: "missing_permission:view_members" as const }

      const gate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      const gateError = memberWriteGateRouteError(gate)
      if (gateError) return gateError

      const docs = await fetchStaffMemberKycFormDocs(client, memberId)
      return { ok: true as const, docs }
    })

    if (isMemberRouteDenial(result)) {
      const status = memberWriteGateHttpStatus(result.error)
      return NextResponse.json(memberRouteDenialBody(result), { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.fetch.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unknown error" })
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    const body = await req.json().catch(() => null)
    const uploads = parseKycUploadPayload(body)
    if (!uploads) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.kyc.upload.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.kyc.upload.denied", { method: "POST", apiPath, status: 403, error: "forbidden" })
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    let postCommit: KycStaffUploadPostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "forbidden" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_kyc")
      if (!allowed) return { error: "missing_permission:edit_kyc" as const }

      const gate = await assertMemberAndBranchActive(client, memberId, actor.institution_id)
      if (gate.ok === false) {
        return memberWriteGateRouteError(gate)!
      }
      const memberRow = gate.member

      const saved = await upsertKycDocFields(client, {
        memberId,
        institutionId: actor.institution_id,
        branchId: String(memberRow.branch_id || actor.branch_id || ""),
        uploads,
        status: "pending_review",
      })

      const kycRowRes = await client.query<MemberKycDocRow>(
        `SELECT doc_type, passport_photo, document_front, document_back, status
         FROM member_kyc_docs
         WHERE member_id = $1
         LIMIT 1`,
        [memberId],
      )
      const kycRow = kycRowRes.rows[0]
      const docType = (kycRow?.doc_type || saved.docTypes[0] || "national_id") as KycDocType
      const readyForReview = kycRow ? isMemberKycDocSetComplete(kycRow) : false

      if (readyForReview) {
        await client.query(
          `UPDATE members SET kyc_status = 'Pending', modified_by = $1, updated_at = NOW() WHERE id = $2`,
          [actor.id, memberId],
        )
      }

      const instRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1`,
        [actor.institution_id],
      )

      postCommit = {
        actorId: actor.id,
        institutionId: actor.institution_id,
        branchId: String(memberRow.branch_id || actor.branch_id || ""),
        institutionName: instRes.rows[0]?.name || "",
        member: {
          id: String(memberRow.id),
          full_name: String(memberRow.full_name || ""),
          member_number: String(memberRow.member_number || ""),
          email: memberRow.email ? String(memberRow.email) : "",
        },
        docType,
        readyForReview,
      }

      return { ok: true, saved: saved.saved, docs: await fetchStaffMemberKycFormDocs(client, memberId) }
    })

    if (isMemberRouteDenial(result)) {
      const status =
        result.error === SUPER_ADMIN_WRITE_BLOCKED || result.error === "missing_permission:edit_kyc" ? 403 :
        memberWriteGateHttpStatus(result.error)
      apiLog("warn", "member.kyc.upload.denied", {
        method: "POST",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json(memberRouteDenialBody(result), { status })
    }

    const ctx = postCommit as KycStaffUploadPostCommit | null
    if (ctx?.readyForReview) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyKycUploaded({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            docType: ctx.docType,
            readyForReview: true,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.kyc.upload.notifications_dispatched" : "member.kyc.upload.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 200,
            memberId,
            docType: ctx.docType,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "member.kyc.upload.notifications_failed", {
          method: "POST", apiPath, status: 200, memberId, docType: ctx.docType,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailContext: KycEmailContext = {
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          actorId: ctx.actorId,
        }
        const emailRes = await enqueueKycUploadedEmail({
          member: ctx.member,
          institutionName: ctx.institutionName,
          docType: ctx.docType,
          context: emailContext,
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "member.kyc.upload.email_enqueue_partial", {
            method: "POST", apiPath, status: 200, memberId, docType: ctx.docType, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "member.kyc.upload.email_enqueue_failed", {
          method: "POST", apiPath, status: 200, memberId, docType: ctx.docType,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    apiLog("info", "member.kyc.upload.success", {
      method: "POST",
      apiPath,
      status: 200,
      memberId,
      authUserId: session.user.authUserId,
      uploadCount: uploads.length,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.upload.error", { method: "POST", apiPath, status: 400, error: err?.message || "Unknown error" })
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 400 })
  }
}
