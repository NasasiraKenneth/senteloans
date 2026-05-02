import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"
import { hasInvestmentPermission, resolveInvestmentActor } from "@/lib/api/investment-rbac"

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
    const actor = await resolveInvestmentActor(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const allowed = await hasInvestmentPermission(client, actor, "edit_investment")
    if (!allowed) return NextResponse.json({ error: "missing_permission:edit_investment" }, { status: 403 })

    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const partnerRes = await client.query(
      `SELECT p.id, p.status
       FROM senteloans_investment_partners p
       JOIN senteloans_investments i ON i.id = p.investment_id
       WHERE p.id = $1
         AND p.investment_id = $2
         AND i.institution_id = $3
         ${isSuperAdmin ? "" : "AND i.branch_id = $4"}
       LIMIT 1`,
      isSuperAdmin ? [partnerId, id, actor.institution_id] : [partnerId, id, actor.institution_id, actor.branch_id],
    )
    if (partnerRes.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    const prevStatus = String(partnerRes.rows[0]?.status || "")

    await client.query(
      `UPDATE senteloans_investment_partners
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, partnerId],
    )
    await auditLogger.logUpdate(
      "senteloans_investment_partners",
      partnerId,
      { status: prevStatus },
      { status },
      actor.institution_id,
      actor.id,
      undefined,
      client,
    )
    return NextResponse.json({ ok: true, status })
  })
}
