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
  const sourceType = String(body.type || body.source_type || "").trim().toLowerCase()
  const amount = Number(body.amount ?? 0)
  const loanId = String(body.loanId || body.loan_id || "").trim() || null
  if (!["savings", "shares", "reserves", "loan", "grant"].includes(sourceType)) {
    return NextResponse.json({ error: "invalid_funding_type" }, { status: 400 })
  }
  if (Number.isNaN(amount) || amount < 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const investmentRes = await client.query(
      `SELECT i.id
       FROM senteloans_investments i
       WHERE i.id = $1
         AND i.institution_id = $2
         ${isSuperAdmin ? "" : "AND i.branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (investmentRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })

    const res = await client.query(
      `INSERT INTO senteloans_investment_funding_sources (
         investment_id, source_type, loan_id, amount
       ) VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, sourceType, sourceType === "loan" ? loanId : null, amount],
    )
    return NextResponse.json({ ok: true, id: res.rows[0]?.id }, { status: 201 })
  })
}
