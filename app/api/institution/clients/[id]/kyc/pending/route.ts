import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id, role FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return null

      const targetRes = await client.query(
        `SELECT id, institution_id FROM senteloans_clients WHERE id = $1`,
        [clientId]
      )
      const target = targetRes.rows[0]
      if (!target) return null
      const isSystemAdmin = (appUser as { role?: string }).role === "system_admin"
      if (!isSystemAdmin && target.institution_id !== appUser.institution_id) return null

      const rowsRes = await client.query(
        `SELECT id, doc_type, url, status, rejection_reason, created_at FROM senteloans_client_kyc_docs WHERE client_id = $1 AND status = 'pending_review' ORDER BY created_at DESC`,
        [clientId]
      )
      return { ok: true, pending: rowsRes.rows }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
