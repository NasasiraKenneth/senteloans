import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { notifyKycUploaded } from "@/lib/notifications/kyc-events"
import { enqueueKycUploadedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"
import {
  assertNotSuperAdmin,
  hasPermission,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
} from "@/lib/api/rbac"
import { isLegacyKycField, upsertKycDocField } from "@/lib/members/kyc-docs"

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
  docType: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    const body = (await req.json()) as { docType?: string; url?: string }
    if (!body?.docType || !body?.url || !isLegacyKycField(body.docType)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
    const legacyField = body.docType
    const uploadUrl = body.url

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
      if (!gate.ok) {
        return {
          error: gate.error,
          memberStatus: gate.memberStatus,
          branchStatus: gate.branchStatus,
        }
      }

      const memberRes = await client.query(
        `SELECT id, branch_id, full_name, member_number, email FROM members WHERE id = $1 AND institution_id = $2`,
        [memberId, actor.institution_id],
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }

      const saved = await upsertKycDocField(client, {
        memberId,
        institutionId: actor.institution_id,
        branchId: String(memberRow.branch_id || actor.branch_id || ""),
        field: legacyField,
        url: uploadUrl,
        status: "verified",
        reviewedBy: actor.id,
      })

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
        docType: saved.legacyField,
      }

      return { ok: true, docId: saved.docId }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" ? 404 :
        result.error === SUPER_ADMIN_WRITE_BLOCKED || result.error === "missing_permission:edit_kyc" ? 403 :
        result.error === "member_inactive" || result.error === "branch_inactive" || result.error === "branch_not_found" || result.error === "forbidden"
          ? 403
          : 403
      apiLog("warn", "member.kyc.upload.denied", {
        method: "POST",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      const payload: Record<string, unknown> = { error: result.error, code: result.error }
      if ("memberStatus" in result && result.memberStatus) payload.member_status = result.memberStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus
      return NextResponse.json(payload, { status })
    }

    const ctx = postCommit as KycStaffUploadPostCommit | null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyKycUploaded({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            docType: ctx.docType,
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
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "member.kyc.upload.notifications_failed", {
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
          method: "POST", apiPath, status: 200, memberId,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    apiLog("info", "member.kyc.upload.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.upload.error", { method: "POST", apiPath, status: 400, error: err?.message || "Unknown error" })
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 400 })
  }
}
