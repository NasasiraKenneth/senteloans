import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { notifyKycApproved } from "@/lib/notifications/kyc-events"
import { enqueueKycApprovedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"
import {
  assertNotSuperAdmin,
  hasPermission,
  normalizeRole,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"

type KycApprovePostCommit = {
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
  docType: string
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

    let postCommit: KycApprovePostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "forbidden" as const }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "edit_kyc")
      if (!allowed) return { error: "missing_permission:edit_kyc" as const }

      const isSystemAdmin = normalizeRole(actor.role) === "system_admin"

      const gate = await assertMemberAndBranchActive(
        client,
        memberId,
        isSystemAdmin ? undefined : actor.institution_id,
      )
      if (!gate.ok) {
        return {
          error: gate.error,
          memberStatus: gate.memberStatus,
          branchStatus: gate.branchStatus,
        }
      }
      const targetMember = await client.query(
        `SELECT id, institution_id, branch_id, full_name, member_number, email FROM members WHERE id = $1`,
        [memberId]
      )
      const targetRow = targetMember.rows[0]
      if (!targetRow) return { error: "member_not_found" as const }
      if (!isSystemAdmin && targetRow.institution_id !== actor.institution_id) return { error: "forbidden" as const }

      const pendingRes = await client.query(
        `SELECT id, institution_id, member_id, doc_type, passport_photo, document_front, document_back, status
         FROM member_kyc_docs WHERE id = $1`,
        [pendingId]
      )
      const pending = pendingRes.rows[0]
      if (!pending) return { error: "pending_not_found" as const }
      if (pending.member_id !== memberId || (!isSystemAdmin && pending.institution_id !== actor.institution_id)) {
        return { error: "forbidden" as const }
      }
      if (pending.status !== "pending_review") return { error: "not_pending" as const }

      const oldValues = {
        status: pending.status,
        passport_photo: pending.passport_photo,
        document_front: pending.document_front,
        document_back: pending.document_back,
      }

      await client.query(
        `UPDATE member_kyc_docs SET status = 'superseded', updated_at = NOW()
         WHERE member_id = $1 AND doc_type = $2 AND status = 'verified'`,
        [memberId, pending.doc_type]
      )

      await client.query(
        `UPDATE member_kyc_docs SET status = 'verified', reviewed_by = $1, reviewed_at = $2, updated_at = NOW() WHERE id = $3`,
        [actor.id, new Date().toISOString(), pendingId]
      )

      await auditLogger.logUpdate(
        "member_kyc_docs",
        pendingId,
        oldValues,
        { status: "verified" },
        actor.institution_id,
        actor.id,
        { branch_id: String(actor.branch_id || "") },
        client
      )

      const instRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1`,
        [actor.institution_id],
      )
      const institutionName = instRes.rows[0]?.name || ""

      postCommit = {
        actorId: actor.id,
        institutionId: actor.institution_id,
        branchId: String(targetRow.branch_id || actor.branch_id || ""),
        institutionName,
        member: {
          id: String(targetRow.id),
          full_name: String(targetRow.full_name || ""),
          member_number: String(targetRow.member_number || ""),
          email: targetRow.email ? String(targetRow.email) : "",
        },
        docType: String(pending.doc_type),
      }

      return { ok: true, docType: pending.doc_type }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" || result.error === "pending_not_found" ? 404 :
        result.error === SUPER_ADMIN_WRITE_BLOCKED || result.error === "missing_permission:edit_kyc" ? 403 :
        result.error === "member_inactive" || result.error === "branch_inactive" || result.error === "branch_not_found" ? 403 :
        403
      apiLog("warn", "member.kyc.approve.denied", { method: "POST", apiPath, status, error: result.error, memberId, authUserId: session.user.authUserId })
      const payload: Record<string, unknown> = { error: result.error, code: result.error }
      if ("memberStatus" in result && result.memberStatus) payload.member_status = result.memberStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus
      return NextResponse.json(payload, { status })
    }

    const ctx = postCommit as KycApprovePostCommit | null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyKycApproved({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            docType: ctx.docType,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.kyc.approve.notifications_dispatched" : "member.kyc.approve.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 200,
            memberId,
            memberNotifications: notifyRes.memberNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "member.kyc.approve.notifications_failed", {
          method: "POST", apiPath, status: 200, memberId,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailContext: KycEmailContext = {
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          actorId: ctx.actorId,
        }
        const emailRes = await enqueueKycApprovedEmail({
          member: ctx.member,
          institutionName: ctx.institutionName,
          docType: ctx.docType,
          context: emailContext,
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "member.kyc.approve.email_enqueue_partial", {
            method: "POST", apiPath, status: 200, memberId, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "member.kyc.approve.email_enqueue_failed", {
          method: "POST", apiPath, status: 200, memberId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    apiLog("info", "member.kyc.approve.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.approve.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
