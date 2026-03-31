import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const sourceType = String(body.type || body.source_type || "").trim().toLowerCase()
  const amount = Number(body.amount ?? 0)
  const loanId = String(body.loanId || body.loan_id || "").trim() || null
  if (!["savings", "shares", "reserves", "loan", "grant"].includes(sourceType)) {
    return NextResponse.json({ error: "invalid_funding_type" }, { status: 400 })
  }
  if (Number.isNaN(amount) || amount < 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  return runWithAuth(session.user.authUserId, async (client) => {
    const res = await client.query(
      `INSERT INTO senteloans_investment_funding_sources (
         investment_id, source_type, loan_id, amount
       ) VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, sourceType, sourceType === "loan" ? loanId : null, amount],
    )
    return NextResponse.json({ ok: true, id: res.rows[0]?.id }, { status: 201 })
  })
}
