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
      const loanRes = await client.query(`SELECT id FROM senteloans_loans WHERE id = $1`, [id])
      if (loanRes.rows.length === 0) return null

      const res = await client.query(
        `SELECT installment_number, due_date, principal_amount, interest_amount, total_amount, amount_paid, status
         FROM senteloans_loan_repayments WHERE loan_id = $1 ORDER BY installment_number ASC`,
        [id]
      )
      const repayments = res.rows.map((r: Record<string, unknown>) => ({
        installment: r.installment_number,
        due_date: r.due_date,
        principal: Number(r.principal_amount || 0),
        interest: Number(r.interest_amount || 0),
        total: Number(r.total_amount || 0),
        amount_paid: Number(r.amount_paid || 0),
        status: String(r.status || "Pending"),
      }))
      return { repayments }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
