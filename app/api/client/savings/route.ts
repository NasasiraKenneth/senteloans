import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id FROM clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null
      const accRes = await client.query(
        `SELECT id, account_number, account_type, available_balance, total_balance, status, open_date, last_transaction_date FROM savings_accounts WHERE client_id = $1 AND institution_id = $2 ORDER BY open_date DESC`,
        [row.id, row.institution_id]
      )
      return { accounts: accRes.rows }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
