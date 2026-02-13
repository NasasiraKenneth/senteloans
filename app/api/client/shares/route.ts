import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id FROM senteloans_clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null
      const sharesRes = await client.query(
        `SELECT id, number_of_shares, share_value, total_value, purchase_date FROM senteloans_client_shares WHERE client_id = $1 ORDER BY purchase_date DESC`,
        [row.id]
      )
      return sharesRes.rows
    })

    if (result === null) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    const history = result.map((r: Record<string, unknown>) => ({
      id: r.id,
      units: Number(r.number_of_shares || 0),
      shareValue: Number(r.share_value || 0),
      totalValue: Number(r.total_value || 0),
      date: r.purchase_date,
    }))
    const totals = history.reduce(
      (acc: { units: number; totalValue: number; lastShareValue: number | null }, h: { units: number; shareValue: number; totalValue: number }) => {
        acc.units += h.units
        acc.totalValue += h.totalValue
        acc.lastShareValue = acc.lastShareValue !== null ? acc.lastShareValue : h.shareValue
        return acc
      },
      { units: 0, totalValue: 0, lastShareValue: history[0]?.shareValue ?? null }
    )
    return NextResponse.json({ history, totals })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
