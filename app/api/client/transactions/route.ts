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
        `SELECT id, institution_id FROM senteloans_clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const txRes = await client.query(
        `SELECT id, transaction_number, type, amount, mode, description, balance_after, transaction_date, account_id
         FROM senteloans_transactions
         WHERE client_id = $1 AND institution_id = $2
         ORDER BY transaction_date DESC LIMIT 20`,
        [row.id, row.institution_id]
      )
      const savRes = await client.query(
        `SELECT COALESCE(SUM(total_balance), 0)::numeric AS total FROM senteloans_savings_accounts WHERE client_id = $1 AND institution_id = $2`,
        [row.id, row.institution_id]
      )
      const shareRes = await client.query(
        `SELECT COALESCE(SUM(total_value), 0)::numeric AS total FROM senteloans_client_shares WHERE client_id = $1`,
        [row.id]
      )
      return {
        transactions: txRes.rows,
        totalSavings: Number(savRes.rows[0]?.total ?? 0),
        totalShares: Number(shareRes.rows[0]?.total ?? 0),
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })

    const transactions = result.transactions.map((t: Record<string, unknown>) => ({
      id: t.id,
      account_id: t.account_id,
      transaction_number: t.transaction_number,
      type: String(t.type),
      amount: Number(t.amount || 0),
      mode: String(t.mode),
      balance: Number(t.balance_after || 0),
      date: t.transaction_date,
      description: (t.description as string) || "",
    }))

    return NextResponse.json({
      transactions,
      aggregates: { totalSavings: result.totalSavings, totalShares: result.totalShares },
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
