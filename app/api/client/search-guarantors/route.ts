import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const url = new URL(req.url)
    const searchQuery = (url.searchParams.get("q") || "").trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      let query = `SELECT id, full_name, phone_number, member_number, kyc_status FROM members WHERE institution_id = $1 AND status = 'Active' AND kyc_status = 'Verified' AND id != $2`
      const params: unknown[] = [row.institution_id, row.id]

      if (searchQuery.length > 0) {
        query += ` AND (full_name ILIKE $3 OR phone_number ILIKE $3 OR member_number ILIKE $3)`
        params.push(`%${searchQuery}%`)
      }

      query += ` ORDER BY full_name ASC LIMIT 50`

      const membersRes = await client.query(query, params)
      const guarantors = membersRes.rows.map((m: { id: string; full_name: string; phone_number: string; member_number: string }) => ({
        id: m.id,
        full_name: m.full_name,
        phone_number: m.phone_number,
        member_number: m.member_number,
      }))
      return { ok: true, guarantors }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
