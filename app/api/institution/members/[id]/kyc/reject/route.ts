import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { notifyKycRejected } from "@/lib/notifications/kyc-events"
import { enqueueKycRejectedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"

type KycRejectPostCommit = {
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
  reason: string
}

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

    let postCommit: KycRejectPostCommit | null = null

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

      const isSystemAdmin = (appUser as { app_role?: string }).app_role === "system_admin"

      const gate = await assertMemberAndBranchActive(
        client,
        memberId,
        isSystemAdmin ? undefined : appUser.institution_id,
      )
      if (!gate.ok) {
        return {
          error: gate.error,
          memberStatus: gate.memberStatus,
          branchStatus: gate.branchStatus,
        }
      }

      const targetRes = await client.query(
        `SELECT id, institution_id, branch_id, full_name, member_number, email FROM members WHERE id = $1`,
        [memberId]
      )
      const targetMember = targetRes.rows[0]
      if (!targetMember) return { error: "member_not_found" as const }
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

      const instRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1`,
        [appUser.institution_id],
      )
      const institutionName = instRes.rows[0]?.name || ""

      postCommit = {
        actorId: appUser.id,
        institutionId: appUser.institution_id,
        branchId: String(targetMember.branch_id || appUser.branch_id || ""),
        institutionName,
        member: {
          id: String(targetMember.id),
          full_name: String(targetMember.full_name || ""),
          member_number: String(targetMember.member_number || ""),
          email: targetMember.email ? String(targetMember.email) : "",
        },
        docType: String(pending.doc_type),
        reason: reason || "Document did not meet requirements",
      }

      return { ok: true }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" || result.error === "pending_not_found" ? 404 :
        result.error === "member_inactive" || result.error === "branch_inactive" || result.error === "branch_not_found" ? 403 :
        403
      apiLog("warn", "member.kyc.reject.denied", { method: "POST", apiPath, status, error: result.error, memberId, authUserId: session.user.authUserId })
      const payload: Record<string, unknown> = { error: result.error, code: result.error }
      if ("memberStatus" in result && result.memberStatus) payload.member_status = result.memberStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus
      return NextResponse.json(payload, { status })
    }

    const ctx = postCommit as KycRejectPostCommit | null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyKycRejected({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            docType: ctx.docType,
            reason: ctx.reason,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "member.kyc.reject.notifications_dispatched" : "member.kyc.reject.notifications_partial",
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
        apiLog("error", "member.kyc.reject.notifications_failed", {
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
        const emailRes = await enqueueKycRejectedEmail({
          member: ctx.member,
          institutionName: ctx.institutionName,
          docType: ctx.docType,
          reason: ctx.reason,
          context: emailContext,
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "member.kyc.reject.email_enqueue_partial", {
            method: "POST", apiPath, status: 200, memberId, errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "member.kyc.reject.email_enqueue_failed", {
          method: "POST", apiPath, status: 200, memberId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    apiLog("info", "member.kyc.reject.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.reject.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
