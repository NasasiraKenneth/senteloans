import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  institution_id: string
  branch_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: loanId } = await params
    if (!loanId || !UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const amount = Number(body.amount)
    const payment_date = String(body.payment_date ?? "").trim().slice(0, 10)

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [loanId, actor.institution_id]
      if (!isSuperAdmin) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const loanRes = await client.query(`SELECT l.id FROM senteloans_institution_loans l WHERE ${where} LIMIT 1`, qparams)
      if (loanRes.rowCount === 0) return { error: "not_found" as const }

      await client.query(
        `INSERT INTO senteloans_institution_loan_repayments (
           loan_id, due_date, amount_paid, payment_date, status
         ) VALUES ($1, $2, $3, $4, 'Paid'::repayment_status)`,
        [loanId, payment_date, amount, payment_date],
      )

      return { ok: true as const }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "user_not_linked" ? 403 : err === "actor_branch_missing" ? 400 : err === "not_found" ? 404 : 400
      apiLog("warn", "sacco_loans.record_payment.denied", { method: "POST", apiPath, status: statusCode, error: err })
      return NextResponse.json({ error: err }, { status: statusCode })
    }

    apiLog("info", "sacco_loans.record_payment.success", { method: "POST", apiPath, status: 201, loanId })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.record_payment.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
