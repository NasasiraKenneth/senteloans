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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
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
    return NextResponse.json({ ok: true, id: res.rows[0]?.id }, { status: 201 })
  })
}
