import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertMemberAndBranchActive } from "@/lib/members/member-status"
import { notifyKycUploaded } from "@/lib/notifications/kyc-events"
import { enqueueKycUploadedEmail, type KycEmailContext } from "@/lib/email/kyc-emails"

const ALLOWED = new Set(["passport_photo", "national_id_front", "national_id_back"])

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
    if (!body?.docType || !body?.url || !ALLOWED.has(body.docType)) {
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
    const column = body.docType

    let postCommit: KycStaffUploadPostCommit | null = null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id, branch_id FROM users WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "forbidden" as const }

      const gate = await assertMemberAndBranchActive(client, memberId, appUser.institution_id)
      if (!gate.ok) {
        return {
          error: gate.error,
          memberStatus: gate.memberStatus,
          branchStatus: gate.branchStatus,
        }
      }

      const memberRes = await client.query(
        `SELECT id, branch_id, full_name, member_number, email FROM members WHERE id = $1 AND institution_id = $2`,
        [memberId, appUser.institution_id],
      )
      const memberRow = memberRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }

      await client.query(`UPDATE members SET ${column} = $1 WHERE id = $2 AND institution_id = $3`, [
        body.url,
        memberId,
        appUser.institution_id,
      ])

      const instRes = await client.query<{ name: string }>(
        `SELECT name FROM institutions WHERE id = $1`,
        [appUser.institution_id],
      )

      postCommit = {
        actorId: appUser.id,
        institutionId: appUser.institution_id,
        branchId: String(memberRow.branch_id || appUser.branch_id || ""),
        institutionName: instRes.rows[0]?.name || "",
        member: {
          id: String(memberRow.id),
          full_name: String(memberRow.full_name || ""),
          member_number: String(memberRow.member_number || ""),
          email: memberRow.email ? String(memberRow.email) : "",
        },
        docType: column,
      }

      return { ok: true }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" ? 404 :
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
