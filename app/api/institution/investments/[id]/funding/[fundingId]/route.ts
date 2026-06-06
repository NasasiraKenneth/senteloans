import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; fundingId: string }> }) {
  const { id: investmentId, fundingId } = await params
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
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment_funding")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment_funding" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const branchClause = isSuperAdmin ? "" : " AND i.branch_id = $7"
    const qParams: unknown[] = isSuperAdmin
      ? [sourceType, sourceType === "loan" ? loanId : null, amount, fundingId, investmentId, actor.institution_id]
      : [sourceType, sourceType === "loan" ? loanId : null, amount, fundingId, investmentId, actor.institution_id, actor.branch_id]

    const prevRes = await client.query(
      `SELECT f.source_type, f.loan_id, f.amount, i.branch_id
       FROM investment_funding_sources f
       JOIN investments i ON i.id = f.investment_id
       WHERE f.id = $4
         AND f.investment_id = $5
         AND i.institution_id = $6${branchClause}`,
      qParams,
    )
    if (prevRes.rowCount === 0) return NextResponse.json({ error: "funding_not_found" }, { status: 404 })
    const prev = prevRes.rows[0] as { source_type: string; loan_id: string | null; amount: unknown; branch_id: string }
    const investmentBranchId = String(prev.branch_id || actor.branch_id || "")

    const upd = await client.query(
      `UPDATE investment_funding_sources f
       SET source_type = $1, loan_id = $2, amount = $3
       FROM investments i
       WHERE f.id = $4
         AND f.investment_id = $5
         AND i.id = f.investment_id
         AND i.institution_id = $6${branchClause}
       RETURNING f.id`,
      qParams,
    )
    if (upd.rowCount === 0) return NextResponse.json({ error: "funding_not_found" }, { status: 404 })
    await auditLogger.logUpdate(
      "investment_funding_sources",
      fundingId,
      {
        source_type: prev.source_type,
        loan_id: prev.loan_id,
        amount: prev.amount,
      },
      {
        source_type: sourceType,
        loan_id: sourceType === "loan" ? loanId : null,
        amount,
      },
      actor.institution_id,
      actor.id,
      { branch_id: investmentBranchId },
      client,
    )
    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fundingId: string }> }) {
  const { id: investmentId, fundingId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment_funding")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment_funding" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const branchClause = isSuperAdmin ? "" : " AND i.branch_id = $4"
    const qParams: unknown[] = isSuperAdmin
      ? [fundingId, investmentId, actor.institution_id]
      : [fundingId, investmentId, actor.institution_id, actor.branch_id]

    const prevRes = await client.query(
      `SELECT f.id, f.investment_id, f.source_type, f.loan_id, f.amount, i.branch_id
       FROM investment_funding_sources f
       JOIN investments i ON i.id = f.investment_id
       WHERE f.id = $1
         AND f.investment_id = $2
         AND i.institution_id = $3${branchClause}`,
      qParams,
    )
    if (prevRes.rowCount === 0) return NextResponse.json({ error: "funding_not_found" }, { status: 404 })
    const prev = prevRes.rows[0] as Record<string, unknown>
    const investmentBranchId = String(prev.branch_id || actor.branch_id || "")

    const del = await client.query(
      `DELETE FROM investment_funding_sources f
       USING investments i
       WHERE f.id = $1
         AND f.investment_id = $2
         AND i.id = f.investment_id
         AND i.institution_id = $3${branchClause}
       RETURNING f.id`,
      qParams,
    )
    if (del.rowCount === 0) return NextResponse.json({ error: "funding_not_found" }, { status: 404 })
    await auditLogger.logDelete(
      "investment_funding_sources",
      fundingId,
      {
        investment_id: prev.investment_id,
        source_type: prev.source_type,
        loan_id: prev.loan_id,
        amount: prev.amount,
      },
      actor.institution_id,
      actor.id,
      { branch_id: investmentBranchId },
      client,
    )
    return NextResponse.json({ ok: true })
  })
}
