import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

type ActorContext = { id: string; institution_id: string; branch_id: string | null; role: string | null }

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const res = await client.query(
    `SELECT u.id, u.institution_id, u.branch_id,
      CASE
        WHEN r.name = 'System Admin' THEN 'system_admin'
        WHEN r.name = 'Super Admin' THEN 'super_admin'
        WHEN r.name = 'Admin' THEN 'institution_admin'
        WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
        ELSE NULL
      END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId],
  )
  return res.rows[0] || null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; partnerId: string }> }) {
  const { partnerId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return runWithAuth(session.user.authUserId, async (client) => {
    const counterpartyId = String(body.counterpartyId || body.counterparty_id || "").trim()
    const role = String(body.role || "").trim() || null
    const status = String(body.status || "Active").trim().toLowerCase() === "inactive" ? "Inactive" : "Active"
    const contributionPercentage = body.contributionPercentage ?? body.contribution_percentage ?? null
    const contributionAmount = body.contributionAmount ?? body.contribution_amount ?? null
    const ownershipPercentage = body.ownershipPercentage ?? body.ownership_percentage ?? null
    await client.query(
      `UPDATE senteloans_investment_partners
       SET counterparty_id = $1, role = $2, status = $3,
           contribution_percentage = $4, contribution_amount = $5, ownership_percentage = $6, updated_at = NOW()
       WHERE id = $7`,
      [counterpartyId, role, status, contributionPercentage, contributionAmount, ownershipPercentage, partnerId],
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
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const investmentRes = await client.query(
      `SELECT i.id, i.status
       FROM senteloans_investments i
       WHERE i.id = $1
         AND i.institution_id = $2
         ${isSuperAdmin ? "" : "AND i.branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (investmentRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
    const investmentStatus = String(investmentRes.rows[0]?.status || "").trim().toLowerCase()
    if (investmentStatus !== "pending") {
      return NextResponse.json({ error: "partner_delete_allowed_only_when_pending" }, { status: 409 })
    }

    const delRes = await client.query(
      `DELETE FROM senteloans_investment_partners
       WHERE id = $1 AND investment_id = $2
       RETURNING id`,
      [partnerId, id],
    )
    if (delRes.rowCount === 0) return NextResponse.json({ error: "partner_not_found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  })
}
