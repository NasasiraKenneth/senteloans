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
} from "@/lib/members/member-status"
import {
  isKycReviewDecision,
  submitMemberKycReview,
  type KycReviewPostCommit,
} from "@/lib/members/kyc-review"
import { notifyKycApproved, notifyKycRejected } from "@/lib/notifications/kyc-events"
import {
  enqueueKycApprovedEmail,
  enqueueKycRejectedEmail,
  type KycEmailContext,
} from "@/lib/email/kyc-emails"
import {
  assertNotSuperAdmin,
  hasPermission,
  normalizeRole,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.kyc.review.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      pendingId?: string
      decision?: string
      rejectionReason?: string
      reason?: string
    }
    const pendingId = (body.pendingId || "").trim()
    const decision = (body.decision || "").trim().toLowerCase()
    const rejectionReason = String(body.rejectionReason ?? body.reason ?? "").trim()

    if (!pendingId) return NextResponse.json({ error: "missing_pending_id" }, { status: 400 })
    if (!isKycReviewDecision(decision)) {
      return NextResponse.json({ error: "invalid_decision" }, { status: 400 })
    }

    let postCommit: KycReviewPostCommit | null = null

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

      const review = await submitMemberKycReview(client, {
        actor,
        memberId,
        pendingId,
        decision,
        rejectionReason,
        isSystemAdmin,
      })

      if (review.ok) {
        postCommit = review.postCommit
        return { ok: true as const, decision, docType: review.postCommit.docType }
      }
      return { error: review.error }
    })

    if (isMemberRouteDenial(result)) {
      const status =
        result.error === "member_not_found" || result.error === "pending_not_found" ? 404 :
        result.error === "rejection_reason_required" ? 400 :
        result.error === SUPER_ADMIN_WRITE_BLOCKED || result.error === "missing_permission:edit_kyc" ? 403 :
        memberWriteGateHttpStatus(result.error)
      apiLog("warn", "member.kyc.review.denied", {
        method: "POST",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json(memberRouteDenialBody(result), { status })
    }

    const ctx = postCommit as KycReviewPostCommit | null
    if (ctx) {
      if (ctx.decision === "approved") {
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
            notifyRes.ok ? "member.kyc.review.notifications_dispatched" : "member.kyc.review.notifications_partial",
            {
              method: "POST",
              apiPath,
              status: 200,
              memberId,
              decision: ctx.decision,
              memberNotifications: notifyRes.memberNotifications,
              ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
            },
          )
        } catch (notifyErr) {
          apiLog("error", "member.kyc.review.notifications_failed", {
            method: "POST", apiPath, status: 200, memberId, decision: ctx.decision,
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
            apiLog("warn", "member.kyc.review.email_enqueue_partial", {
              method: "POST", apiPath, status: 200, memberId, errors: emailRes.errors,
            })
          }
        } catch (emailErr) {
          apiLog("error", "member.kyc.review.email_enqueue_failed", {
            method: "POST", apiPath, status: 200, memberId,
            error: (emailErr as Error)?.message || "email_failed",
          })
        }
      } else {
        const reason = ctx.rejectionReason || "Document did not meet requirements"
        try {
          const notifyRes = await runWithoutAuth((notifyClient) =>
            notifyKycRejected({
              client: notifyClient,
              actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
              member: ctx.member,
              docType: ctx.docType,
              reason,
            }),
          )
          apiLog(notifyRes.ok ? "info" : "warn",
            notifyRes.ok ? "member.kyc.review.notifications_dispatched" : "member.kyc.review.notifications_partial",
            {
              method: "POST",
              apiPath,
              status: 200,
              memberId,
              decision: ctx.decision,
              memberNotifications: notifyRes.memberNotifications,
              ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
            },
          )
        } catch (notifyErr) {
          apiLog("error", "member.kyc.review.notifications_failed", {
            method: "POST", apiPath, status: 200, memberId, decision: ctx.decision,
            error: (notifyErr as Error)?.message || "notify_failed",
          })
        }

        try {
          const emailContext: KycEmailContext = {
            institutionId: ctx.institutionId,
            branchId: ctx.branchId,
            actorId: ctx.actorId,
          }
          const emailRes = await enqueueKycRejectedEmail({
            member: ctx.member,
            institutionName: ctx.institutionName,
            docType: ctx.docType,
            reason,
            context: emailContext,
          })
          if (emailRes.errors.length > 0) {
            apiLog("warn", "member.kyc.review.email_enqueue_partial", {
              method: "POST", apiPath, status: 200, memberId, errors: emailRes.errors,
            })
          }
        } catch (emailErr) {
          apiLog("error", "member.kyc.review.email_enqueue_failed", {
            method: "POST", apiPath, status: 200, memberId,
            error: (emailErr as Error)?.message || "email_failed",
          })
        }
      }
    }

    apiLog("info", "member.kyc.review.success", {
      method: "POST",
      apiPath,
      status: 200,
      memberId,
      authUserId: session.user.authUserId,
      decision: result && "decision" in result ? result.decision : undefined,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.review.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
