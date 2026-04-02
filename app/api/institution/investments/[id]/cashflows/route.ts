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
      `SELECT
         cf.id,
         cf.investment_id,
         cf.transaction_id,
         t.transaction_number,
         cf.report_id,
         r.report_number,
         cf.type,
         cf.category,
         cf.amount,
         cf.description,
         cf.date,
         cf.created_at
       FROM senteloans_investment_cashflows cf
       LEFT JOIN senteloans_transactions t ON t.id = cf.transaction_id
       LEFT JOIN senteloans_investment_reports r ON r.id = cf.report_id
       WHERE cf.investment_id = $1
       ORDER BY COALESCE(cf.date, cf.created_at::date) DESC NULLS LAST, cf.created_at DESC`,
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
  const date = String(body.date || "").trim()
  const modeRaw = String(body.mode || "").trim()
  const mode = modeRaw || null

  if (!["inflow", "outflow"].includes(type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  if (!["capital", "income", "expense", "adjustment"].includes(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 })
  if (Number.isNaN(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  if (category !== "adjustment" && !mode) return NextResponse.json({ error: "mode_required" }, { status: 400 })
  if (mode && !["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"].includes(mode)) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
  }

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    await client.query("BEGIN")
    try {
      const invRes = await client.query(
        `SELECT id, institution_id, branch_id, provider_id, investment_number
         FROM senteloans_investments
         WHERE id = $1 AND institution_id = $2
         ${isSuperAdmin ? "" : "AND branch_id = $3"}
         LIMIT 1`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      if (invRes.rowCount === 0) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "investment_not_found" }, { status: 404 })
      }
      const inv = invRes.rows[0] as {
        id: string
        institution_id: string
        branch_id: string
        provider_id: string | null
        investment_number: string | null
      }

      const txType = type === "inflow" ? "Deposit" : "Withdrawal"
      const txDate = `${date}T00:00:00.000Z`
      const transactionNumber = `INV-CF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

      let transactionId: string | null = null
      if (category !== "adjustment") {
        const txRes = await client.query(
          `INSERT INTO senteloans_transactions (
             institution_id, branch_id, client_id, transaction_number, type, amount, mode, description,
             reference_number, processed_by, transaction_date, status
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Completed')
           RETURNING id`,
          [
            inv.institution_id,
            inv.branch_id,
            inv.provider_id,
            transactionNumber,
            txType,
            amount,
            mode,
            description || `Investment cashflow (${inv.investment_number || inv.id})`,
            transactionNumber,
            actor.id,
            txDate,
          ],
        )
        transactionId = txRes.rows[0]?.id || null
      }

      if (category === "adjustment") {
        try {
          await client.query(
            `INSERT INTO senteloans_investment_valuations (investment_id, valuation_date, value, notes)
             VALUES ($1, $2::date, $3, $4)`,
            [id, date, amount, description],
          )
        } catch (e: any) {
          if (String(e?.code) === "23505") {
            await client.query("ROLLBACK")
            return NextResponse.json({ error: "valuation_exists_for_date" }, { status: 409 })
          }
          throw e
        }
      }

      const insertRes = await client.query(
        `INSERT INTO senteloans_investment_cashflows (investment_id, transaction_id, report_id, type, category, amount, description, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [id, transactionId, null, type, category, amount, description, date],
      )
      await client.query("COMMIT")
      return NextResponse.json({ ok: true, id: insertRes.rows[0]?.id, transaction_id: transactionId }, { status: 201 })
    } catch (e: any) {
      await client.query("ROLLBACK")
      throw e
    }
  })
}
