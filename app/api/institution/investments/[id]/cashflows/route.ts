import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
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
  return actorRes.rows[0] || null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const invRes = await client.query(
      `SELECT id
       FROM senteloans_investments
       WHERE id = $1 AND institution_id = $2
       ${isSuperAdmin ? "" : "AND branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })

    const cashflowsRes = await client.query(
      `SELECT id, investment_id, transaction_id, report_id, type, category, amount, description, date, created_at
       FROM senteloans_investment_cashflows
       WHERE investment_id = $1
       ORDER BY COALESCE(date, created_at::date) DESC NULLS LAST, created_at DESC`,
      [id],
    )
    return NextResponse.json({ items: cashflowsRes.rows })
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const type = String(body.type || "").trim().toLowerCase()
  const category = String(body.category || "").trim().toLowerCase()
  const amount = Number(body.amount || 0)
  const description = String(body.description || "").trim() || null

  if (!["inflow", "outflow"].includes(type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  if (!["capital", "income", "expense", "adjustment"].includes(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 })
  }
  if (Number.isNaN(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 })

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    const invRes = await client.query(
      `SELECT id
       FROM senteloans_investments
       WHERE id = $1 AND institution_id = $2
       ${isSuperAdmin ? "" : "AND branch_id = $3"}
       LIMIT 1`,
      isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
    )
    if (invRes.rowCount === 0) return NextResponse.json({ error: "investment_not_found" }, { status: 404 })

    const insertRes = await client.query(
      `INSERT INTO senteloans_investment_cashflows (investment_id, type, category, amount, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [id, type, category, amount, description],
    )
    return NextResponse.json({ ok: true, id: insertRes.rows[0]?.id }, { status: 201 })
  })
}
