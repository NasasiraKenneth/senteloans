import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const body = (await req.json().catch(() => ({}))) as { pendingId?: string }
    const pendingId = (body?.pendingId || "").trim()
    if (!pendingId) return NextResponse.json({ error: "missing_pending_id" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id FROM clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const docRes = await client.query(
        `SELECT id, client_id, institution_id, status FROM client_kyc_docs WHERE id = $1`,
        [pendingId]
      )
      const doc = docRes.rows[0]
      if (!doc) return { error: "pending_not_found" as const }
      if (doc.client_id !== row.id) return { error: "forbidden" as const }
      if (doc.status !== "pending_review") return { error: "not_pending" as const }

      await client.query(
        `UPDATE client_kyc_docs SET status = 'rejected', rejection_reason = 'cancelled_by_client' WHERE id = $1`,
        [pendingId]
      )
      await auditLogger.logUpdate(
        "client_kyc_docs",
        pendingId,
        { status: "pending_review" },
        { status: "rejected", rejection_reason: "cancelled_by_client" },
        row.institution_id,
        undefined,
        undefined,
        client
      )
      return { ok: true }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    if (result && "error" in result) {
      const status = result.error === "pending_not_found" ? 404 : result.error === "forbidden" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
