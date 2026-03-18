import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

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

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT
           u.id,
           u.institution_id,
          CASE
            WHEN r.name = 'System Admin' THEN 'system_admin'
            WHEN r.name = 'Super Admin' THEN 'super_admin'
            WHEN r.name = 'Admin' THEN 'institution_admin'
            WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
            ELSE NULL
          END AS app_role
         FROM senteloans_users u
         LEFT JOIN senteloans_roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return null

      const targetRes = await client.query(
        `SELECT id, institution_id FROM senteloans_members WHERE id = $1`,
        [memberId]
      )
      const target = targetRes.rows[0]
      if (!target) return null
      const isSystemAdmin = (appUser as { app_role?: string }).app_role === "system_admin"
      if (!isSystemAdmin && target.institution_id !== appUser.institution_id) return null

      const rowsRes = await client.query(
        `SELECT id, doc_type, url, status, rejection_reason, created_at FROM senteloans_member_kyc_docs WHERE member_id = $1 AND status = 'pending_review' ORDER BY created_at DESC`,
        [memberId]
      )
      return { ok: true, pending: rowsRes.rows }
    })

    if (!result) {
      apiLog("warn", "member.kyc.pending.not_found", { method: "GET", apiPath, status: 404, memberId, authUserId: session.user.authUserId })
      return NextResponse.json({ error: "member_not_found" }, { status: 404 })
    }
    apiLog("info", "member.kyc.pending.success", { method: "GET", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.pending.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
