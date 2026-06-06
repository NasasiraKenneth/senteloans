import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; partnerId: string }> }) {
  const { id: investmentId, partnerId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment" }, { status: 403 })

    const counterpartyId = String(body.counterpartyId || body.counterparty_id || "").trim()
    const role = String(body.role || "").trim() || null
    const status = String(body.status || "Active").trim().toLowerCase() === "inactive" ? "Inactive" : "Active"
    const contributionPercentage = body.contributionPercentage ?? body.contribution_percentage ?? null
    const contributionAmount = body.contributionAmount ?? body.contribution_amount ?? null
    const ownershipPercentage = body.ownershipPercentage ?? body.ownership_percentage ?? null

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const setParams: unknown[] = [
      counterpartyId,
      role,
      status,
      contributionPercentage,
      contributionAmount,
      ownershipPercentage,
      partnerId,
      investmentId,
      actor.institution_id,
    ]
    const branchClause = isSuperAdmin ? "" : " AND i.branch_id = $10"
    const params: unknown[] = isSuperAdmin ? setParams : [...setParams, actor.branch_id]

    const prevRes = await client.query(
      `SELECT
         p.id,
         p.counterparty_id,
         p.role,
         p.status,
         p.contribution_percentage,
         p.contribution_amount,
         p.ownership_percentage,
         i.branch_id
       FROM investment_partners p
       JOIN investments i ON i.id = p.investment_id
       WHERE p.id = $7
         AND p.investment_id = $8
         AND i.institution_id = $9${branchClause}`,
      params,
    )
    if (prevRes.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    const investmentBranchId = String((prevRes.rows[0] as { branch_id?: string })?.branch_id || actor.branch_id || "")
    const prev = prevRes.rows[0] as {
      counterparty_id: string
      role: string | null
      status: string
      contribution_percentage: unknown
      contribution_amount: unknown
      ownership_percentage: unknown
    }

    const upd = await client.query(
      `UPDATE investment_partners p
       SET counterparty_id = $1,
           role = $2,
           status = $3,
           contribution_percentage = $4,
           contribution_amount = $5,
           ownership_percentage = $6,
           updated_at = NOW()
       FROM investments i
       WHERE p.id = $7
         AND p.investment_id = $8
         AND i.id = p.investment_id
         AND i.institution_id = $9${branchClause}
       RETURNING p.id`,
      params,
    )
    if (upd.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    await auditLogger.logUpdate(
      "investment_partners",
      partnerId,
      {
        counterparty_id: prev.counterparty_id,
        role: prev.role,
        status: prev.status,
        contribution_percentage: prev.contribution_percentage,
        contribution_amount: prev.contribution_amount,
        ownership_percentage: prev.ownership_percentage,
      },
      {
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
    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; partnerId: string }> }) {
  const { id, partnerId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const investmentRes = await client.query(
      `SELECT i.id, i.status, i.branch_id
       FROM investments i
       WHERE i.id = $1
         AND i.institution_id = $2
         ${isSuperAdmin ? "" : "AND i.branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (investmentRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
    const investmentBranchId = String(investmentRes.rows[0]?.branch_id || actor.branch_id || "")
    const investmentStatus = String(investmentRes.rows[0]?.status || "").trim().toLowerCase()
    if (investmentStatus !== "pending") {
      return NextResponse.json({ error: "partner_delete_allowed_only_when_pending" }, { status: 409 })
    }

    const prevPartnerRes = await client.query(
      `SELECT
         p.id,
         p.counterparty_id,
         p.role,
         p.status,
         p.contribution_percentage,
         p.contribution_amount,
         p.ownership_percentage
       FROM investment_partners p
       WHERE p.id = $1 AND p.investment_id = $2
       LIMIT 1`,
      [partnerId, id],
    )
    if (prevPartnerRes.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    const prevP = prevPartnerRes.rows[0] as Record<string, unknown>

    const delRes = await client.query(
      `DELETE FROM investment_partners
       WHERE id = $1 AND investment_id = $2
       RETURNING id`,
      [partnerId, id],
    )
    if (delRes.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    await auditLogger.logDelete(
      "investment_partners",
      partnerId,
      {
        investment_id: id,
        counterparty_id: prevP.counterparty_id,
        role: prevP.role,
        status: prevP.status,
        contribution_percentage: prevP.contribution_percentage,
        contribution_amount: prevP.contribution_amount,
        ownership_percentage: prevP.ownership_percentage,
      },
      actor.institution_id,
      actor.id,
      { branch_id: investmentBranchId },
      client,
    )
    return NextResponse.json({ ok: true })
  })
}
