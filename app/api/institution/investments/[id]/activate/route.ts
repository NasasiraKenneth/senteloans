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

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const makeTransactionNumber = () => `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const startDate = String(body.start_date || "").trim()
  const maturityDate = String(body.maturity_date || "").trim()
  const mode = String(body.mode || "").trim()
  const description = String(body.description || "").trim() || null
  const principalAmount = Number(body.principal_amount ?? 0)

  if (!isDateOnly(startDate)) return NextResponse.json({ error: "invalid_start_date" }, { status: 400 })
  if (!isDateOnly(maturityDate)) return NextResponse.json({ error: "invalid_maturity_date" }, { status: 400 })
  if (!["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"].includes(mode)) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
  }
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    return NextResponse.json({ error: "invalid_principal_amount" }, { status: 400 })
  }

  return runWithAuth(session.user.authUserId, async (client) => {
    const actor = await resolveActorContext(client, session.user.authUserId as string)
    if (!actor?.institution_id) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })
    const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
    if (!isSuperAdmin && !actor.branch_id) return NextResponse.json({ error: "actor_branch_missing" }, { status: 400 })

    await client.query("BEGIN")
    try {
      const invRes = await client.query(
        `SELECT id, institution_id, branch_id, provider_id, investment_number, initial_amount, status
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
        initial_amount: number
        status: string
      }
      const currentStatus = String(inv.status || "").toLowerCase()
      if (currentStatus !== "approved") {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "investment_must_be_approved_first" }, { status: 409 })
      }
      const amount = principalAmount
      if (!(amount > 0)) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "invalid_investment_amount" }, { status: 400 })
      }

      const txDate = `${startDate}T00:00:00.000Z`
      let txRes: { rows: Array<{ id: string }> } | null = null
      let transactionNumber = ""
      for (let i = 0; i < 5; i++) {
        transactionNumber = makeTransactionNumber()
        try {
          txRes = await client.query(
            `INSERT INTO senteloans_transactions (
               institution_id, branch_id, client_id, transaction_number, type, amount, mode, description,
               reference_number, processed_by, transaction_date, status
             )
             VALUES ($1,$2,$3,$4,'Investment Deposit',$5,$6,$7,$8,$9,$10,'Completed')
             RETURNING id`,
            [
              inv.institution_id,
              inv.branch_id,
              inv.provider_id,
              transactionNumber,
              amount,
              mode,
              description || `Investment activation deposit (${inv.investment_number || inv.id})`,
              transactionNumber,
              actor.id,
              txDate,
            ],
          )
          break
        } catch (e: any) {
          if (String(e?.code) === "23505") continue
          throw e
        }
      }
      if (!txRes) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "transaction_number_generation_failed" }, { status: 500 })
      }

      await client.query(
        `UPDATE senteloans_investments
         SET status = 'active',
             start_date = $1::date,
             maturity_date = $2::date,
             modified_by = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [startDate, maturityDate, actor.id, id],
      )

      await client.query("COMMIT")
      return NextResponse.json({
        ok: true,
        transaction_id: txRes?.rows?.[0]?.id || null,
        transaction_number: transactionNumber,
      })
    } catch (e: any) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: e?.message || "activation_failed" }, { status: 500 })
    }
  })
}
