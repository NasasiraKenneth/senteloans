import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; fundingId: string }> }) {
  const { fundingId } = await params
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
    await client.query(
      `UPDATE senteloans_investment_funding_sources
       SET source_type = $1, loan_id = $2, amount = $3
       WHERE id = $4`,
      [sourceType, sourceType === "loan" ? loanId : null, amount, fundingId],
    )
    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fundingId: string }> }) {
  const { fundingId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  return runWithAuth(session.user.authUserId, async (client) => {
    await client.query(`DELETE FROM senteloans_investment_funding_sources WHERE id = $1`, [fundingId])
    return NextResponse.json({ ok: true })
  })
}
