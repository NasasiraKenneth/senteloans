import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_account_id" }, { status: 400 })

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
        `SELECT id, account_number, account_type, available_balance, total_balance, status, open_date, last_transaction_date FROM savings_accounts WHERE id = $1 AND client_id = $2 AND institution_id = $3`,
        [id, row.id, row.institution_id]
      )
      const account = accRes.rows[0]
      if (!account) return null

      const txRes = await client.query(
        `SELECT id, type, amount, mode, description, balance_after, transaction_date FROM transactions WHERE account_id = $1 AND client_id = $2 ORDER BY transaction_date DESC LIMIT 20`,
        [account.id, row.id]
      )
      const transactions = txRes.rows.map((t: Record<string, unknown>) => ({
        id: t.id,
        type: String(t.type),
        amount: Number(t.amount || 0),
        mode: String(t.mode),
        balance: Number(t.balance_after || 0),
        date: t.transaction_date,
        description: (t.description as string) || "",
      }))
      return { account, transactions }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
