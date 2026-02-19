import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const accRes = await client.query(
        `SELECT id, client_id, institution_id, account_number, account_type, available_balance, total_balance, status, open_date, last_transaction_date FROM senteloans_savings_accounts WHERE id = $1`,
        [id]
      )
      const acc = accRes.rows[0]
      if (!acc) return null

      let clientName = ""
      let clientNumber = ""
      if (acc.client_id) {
        const cRes = await client.query(`SELECT id, full_name, client_number FROM senteloans_clients WHERE id = $1`, [acc.client_id])
        clientName = cRes.rows[0]?.full_name || ""
        clientNumber = cRes.rows[0]?.client_number || ""
      }

      const txRes = await client.query(
        `SELECT id, type, amount, mode, description, balance_after, transaction_date FROM senteloans_transactions WHERE account_id = $1 ORDER BY transaction_date DESC LIMIT 25`,
        [acc.id]
      )

      return {
        account: {
          id: acc.id,
          client_id: acc.client_id,
          institution_id: acc.institution_id,
          account_number: acc.account_number,
          account_type: acc.account_type,
          available_balance: acc.available_balance,
          total_balance: acc.total_balance,
          status: acc.status,
          open_date: acc.open_date,
          last_transaction_date: acc.last_transaction_date,
          client_name: clientName,
          client_number: clientNumber,
        },
        transactions: txRes.rows.map((t: Record<string, unknown>) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          mode: t.mode,
          description: t.description,
          balance: t.balance_after,
          date: t.transaction_date,
        })),
      }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = (await req.json()) as { status?: string }
    const status = body.status
    const updates: Record<string, unknown> = {}
    if (typeof status !== "undefined") {
      const allowed = ["Active", "Inactive", "Suspended", "Closed"]
      if (!allowed.includes(String(status))) return NextResponse.json({ error: "invalid_status" }, { status: 400 })
      updates.status = status
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "no_changes" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const curRes = await client.query(`SELECT id, status FROM senteloans_savings_accounts WHERE id = $1`, [id])
      const current = curRes.rows[0]
      if (!current) return null
      if (current.status === "Closed" && status === "Active") {
        return { error: "invalid_transition_closed_to_active" as const }
      }
      await client.query(`UPDATE senteloans_savings_accounts SET status = $1 WHERE id = $2`, [status, id])
      const accRes = await client.query(
        `SELECT id, client_id, institution_id, account_number, account_type, available_balance, total_balance, status, open_date, last_transaction_date FROM senteloans_savings_accounts WHERE id = $1`,
        [id]
      )
      return { ok: true, account: accRes.rows[0] }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (result && "error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
