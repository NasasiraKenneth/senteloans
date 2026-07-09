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

  return runWithAuth(session.user.authUserId, async (client) => {
    const access = await assertInvestmentWriteAccess(
      client,
      session.user.authUserId as string,
      "edit_investment",
    )
    if (!access.ok) {
      const { status, body: denialBody } = investmentRouteDenialResponse(access)
      return NextResponse.json(denialBody, { status })
    }
    const { actor } = access

    const invRes = await client.query(
      `SELECT id, branch_id FROM investments
       WHERE id = $1 AND institution_id = $2 AND branch_id = $3
       LIMIT 1`,
      [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
    const investmentBranchId = String(invRes.rows[0]?.branch_id || actor.branch_id)

    const counterpartyId = String(body.counterpartyId || body.counterparty_id || "").trim()
    const role = String(body.role || "").trim() || null
    const status = String(body.status || "Active").trim().toLowerCase() === "inactive" ? "Inactive" : "Active"
    const contributionPercentage = body.contributionPercentage ?? body.contribution_percentage ?? null
    const contributionAmount = body.contributionAmount ?? body.contribution_amount ?? null
    const ownershipPercentage = body.ownershipPercentage ?? body.ownership_percentage ?? null
    if (!counterpartyId) return NextResponse.json({ error: "counterparty_required" }, { status: 400 })
    const res = await client.query(
      `INSERT INTO investment_partners (
         investment_id, counterparty_id, role, status, contribution_percentage, contribution_amount, ownership_percentage, created_by, modified_by, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,NOW())
       RETURNING id`,
      [id, counterpartyId, role, status, contributionPercentage, contributionAmount, ownershipPercentage, actor.id],
    )
    const newId = String(res.rows[0]?.id || "")
    await auditLogger.logInsert(
      "investment_partners",
      newId,
      {
        investment_id: id,
        counterparty_id: counterpartyId,
        role,
        status,
        contribution_percentage: contributionPercentage,
        contribution_amount: contributionAmount,
        ownership_percentage: ownershipPercentage,
      },
      actor.institution_id,
      actor.id,
      { branch_id: investmentBranchId },
      client,
    )
    return NextResponse.json({ ok: true, id: newId }, { status: 201 })
  })
}
