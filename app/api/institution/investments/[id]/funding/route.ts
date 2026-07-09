import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  assertInvestmentWriteAccess,
  investmentRouteDenialResponse,
} from "@/lib/api/investment-access"

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
    const access = await assertInvestmentWriteAccess(
      client,
      session.user.authUserId as string,
      "edit_investment_funding",
    )
    if (!access.ok) {
      const { status, body } = investmentRouteDenialResponse(access)
      return NextResponse.json(body, { status })
    }
    const { actor } = access

    const investmentRes = await client.query(
      `SELECT i.id, i.branch_id
       FROM investments i
       WHERE i.id = $1
         AND i.institution_id = $2
         AND i.branch_id = $3
       LIMIT 1`,
      [id, actor.institution_id, actor.branch_id],
    )
    if (investmentRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
    const investmentBranchId = String(investmentRes.rows[0]?.branch_id || actor.branch_id || "")

    const res = await client.query(
      `INSERT INTO investment_funding_sources (
         investment_id, source_type, loan_id, amount
       ) VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, sourceType, sourceType === "loan" ? loanId : null, amount],
    )
    const newId = String(res.rows[0]?.id || "")
    await auditLogger.logInsert(
      "investment_funding_sources",
      newId,
      {
        investment_id: id,
        source_type: sourceType,
        loan_id: sourceType === "loan" ? loanId : null,
        amount,
      },
      actor.institution_id,
      actor.id,
      { branch_id: investmentBranchId },
      client,
    )
    return NextResponse.json({ ok: true, id: newId }, { status: 201 })
  })
}
