import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import {
  assertInvestmentWriteAccess,
  investmentRouteDenialResponse,
} from "@/lib/api/investment-access"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; partnerId: string }> }) {
  const { id, partnerId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const requestedStatus = String(body.status || "").trim().toLowerCase()
  if (!["active", "inactive"].includes(requestedStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }
  const status = requestedStatus === "inactive" ? "Inactive" : "Active"

  return runWithAuth(session.user.authUserId, async (client) => {
    const access = await assertInvestmentWriteAccess(
      client,
      session.user.authUserId as string,
      "edit_investment",
    )
    if (!access.ok) {
      const { status: httpStatus, body: denialBody } = investmentRouteDenialResponse(access)
      return NextResponse.json(denialBody, { status: httpStatus })
    }
    const { actor } = access

    const partnerRes = await client.query(
      `SELECT p.id, p.status, i.branch_id
       FROM investment_partners p
       JOIN investments i ON i.id = p.investment_id
       WHERE p.id = $1
         AND p.investment_id = $2
         AND i.institution_id = $3
         AND i.branch_id = $4
       LIMIT 1`,
      [partnerId, id, actor.institution_id, actor.branch_id],
    )
    if (partnerRes.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    const prevStatus = String(partnerRes.rows[0]?.status || "")
    const investmentBranchId = String(partnerRes.rows[0]?.branch_id || actor.branch_id)

    await client.query(
      `UPDATE investment_partners
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, partnerId],
    )
    await auditLogger.logUpdate(
      "investment_partners",
      partnerId,
      { status: prevStatus },
      { status },
      actor.institution_id,
      actor.id,
      { branch_id: investmentBranchId },
      client,
    )
    return NextResponse.json({ ok: true, status })
  })
}
