import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const invRes = await client.query(
      `SELECT id FROM senteloans_investments
       WHERE id = $1 AND institution_id = $2
       ${isSuperAdmin ? "" : "AND branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })

    const counterpartyId = String(body.counterpartyId || body.counterparty_id || "").trim()
    const role = String(body.role || "").trim() || null
    const status = String(body.status || "Active").trim().toLowerCase() === "inactive" ? "Inactive" : "Active"
    const contributionPercentage = body.contributionPercentage ?? body.contribution_percentage ?? null
    const contributionAmount = body.contributionAmount ?? body.contribution_amount ?? null
    const ownershipPercentage = body.ownershipPercentage ?? body.ownership_percentage ?? null
    if (!counterpartyId) return NextResponse.json({ error: "counterparty_required" }, { status: 400 })
    const res = await client.query(
      `INSERT INTO senteloans_investment_partners (
         investment_id, counterparty_id, role, status, contribution_percentage, contribution_amount, ownership_percentage, created_by, modified_by, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,NOW())
       RETURNING id`,
      [id, counterpartyId, role, status, contributionPercentage, contributionAmount, ownershipPercentage, actor.id],
    )
    const newId = String(res.rows[0]?.id || "")
    await auditLogger.logInsert(
      "senteloans_investment_partners",
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
      undefined,
      client,
    )
    return NextResponse.json({ ok: true, id: newId }, { status: 201 })
  })
}
