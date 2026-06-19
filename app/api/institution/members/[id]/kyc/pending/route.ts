import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, normalizeRole, resolveActorContext } from "@/lib/api/rbac"
import { mapPendingKycRows, type MemberKycDocRow } from "@/lib/members/kyc-docs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id: memberId } = await params
    if (!memberId) return NextResponse.json({ error: "missing_member_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.kyc.pending.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.kyc.pending.denied", { method: "GET", apiPath, status: 403, error: "forbidden" })
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session!.user!.authUserId)
      if (!actor) return { error: "forbidden" as const }

      const allowed = await hasPermission(client, actor, "edit_kyc")
      if (!allowed) return { error: "missing_permission:edit_kyc" as const }

      const isSystemAdmin = normalizeRole(actor.role) === "system_admin"

      const targetRes = await client.query(
        `SELECT id, institution_id FROM members WHERE id = $1`,
        [memberId]
      )
      const target = targetRes.rows[0]
      if (!target) return { error: "member_not_found" as const }
      if (!isSystemAdmin && target.institution_id !== actor.institution_id) {
        return { error: "forbidden" as const }
      }

      const rowsRes = await client.query<MemberKycDocRow>(
        `SELECT id, doc_type, passport_photo, document_front, document_back, status, rejection_reason, created_at
         FROM member_kyc_docs
         WHERE member_id = $1 AND status = 'pending_review'
         ORDER BY created_at DESC`,
        [memberId]
      )
      return { ok: true, pending: mapPendingKycRows(rowsRes.rows) }
    })

    if (result && "error" in result) {
      const status =
        result.error === "member_not_found" ? 404 :
        result.error === "missing_permission:edit_kyc" || result.error === "forbidden" ? 403 :
        403
      apiLog("warn", "member.kyc.pending.denied", {
        method: "GET",
        apiPath,
        status,
        error: result.error,
        memberId,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: result.error, code: result.error }, { status })
    }

    apiLog("info", "member.kyc.pending.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.pending.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
