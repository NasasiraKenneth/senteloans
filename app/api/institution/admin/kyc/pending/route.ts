import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/institution/admin/kyc/pending
 * Optional query: clientId
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "forbidden" }, { status: 403 })

    const url = new URL(req.url)
    const clientId = url.searchParams.get("clientId")?.trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        "SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1",
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return null

      let where = "status = 'pending_review' AND institution_id = $1"
      const params: unknown[] = [appUser.institution_id]
      let idx = 2
      if (clientId) {
        where += ` AND client_id = $${idx++}`
        params.push(clientId)
      }
      params.push(500)
      const docsRes = await client.query(
        `SELECT id, client_id, institution_id, doc_type, url, created_at FROM senteloans_client_kyc_docs WHERE ${where} ORDER BY created_at DESC LIMIT $${idx}`,
        params
      )
      const pendingDocs = docsRes.rows
      const ids = [...new Set(pendingDocs.map((d: { client_id: string }) => d.client_id))]
      let clientMap: Record<string, { id: string; client_number: string; full_name: string; institution_id: string }> = {}
      if (ids.length > 0) {
        const cRes = await client.query(
          "SELECT id, client_number, full_name, institution_id FROM senteloans_clients WHERE id = ANY($1::uuid[])",
          [ids]
        )
        clientMap = Object.fromEntries(cRes.rows.map((c: { id: string; client_number: string; full_name: string; institution_id: string }) => [c.id, c]))
      }
      const items = pendingDocs.map((d: { id: string; client_id: string; institution_id: string; doc_type: string; url: string; created_at: string }) => ({
        pendingId: d.id,
        clientId: d.client_id,
        institutionId: d.institution_id,
        docType: d.doc_type,
        url: d.url,
        submittedAt: d.created_at,
        client: clientMap[d.client_id] || null,
      }))
      return { ok: true, items }
    })

    if (!result) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
