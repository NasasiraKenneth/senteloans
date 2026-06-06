import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/institution/shares-report
 * Returns aggregated share data for the institution (for reports/shares page).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const res = await client.query(
        `SELECT c.id, c.full_name, c.client_number, c.phone_number,
                COALESCE(SUM(s.number_of_shares), 0)::int AS number_of_shares,
                COALESCE(MAX(s.share_value), 0) AS share_value,
                COALESCE(SUM(s.total_value), 0) AS total_share_value
         FROM clients c
         LEFT JOIN client_shares s ON s.client_id = c.id
         WHERE c.institution_id = (SELECT institution_id FROM users WHERE supabase_user_id = $1)
           AND c.status = 'Active'
         GROUP BY c.id, c.full_name, c.client_number, c.phone_number
         ORDER BY total_share_value DESC NULLS LAST, c.full_name`,
        [session!.user!.authUserId]
      )
      const members = res.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        full_name: r.full_name,
        client_number: r.client_number,
        phone_number: r.phone_number,
        numberOfShares: Number(r.number_of_shares || 0),
        share_value: Number(r.share_value || 0),
        totalShareValue: Number(r.total_share_value || 0),
      }))
      const totalMembers = members.length
      const totalShares = members.reduce((s, m) => s + m.numberOfShares, 0)
      const totalShareValue = members.reduce((s, m) => s + m.totalShareValue, 0)
      const avgSharesPerMember = totalMembers > 0 ? totalShares / totalMembers : 0
      return {
        members,
        totalMembers,
        totalShares,
        totalShareValue,
        avgSharesPerMember: Math.round(avgSharesPerMember),
      }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
