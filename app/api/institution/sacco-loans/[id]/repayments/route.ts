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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

      const accessRes = await client.query(`SELECT 1 FROM senteloans_institution_loans l WHERE ${where} LIMIT 1`, qparams)
      if (accessRes.rowCount === 0) return { notFound: true as const }

      const rowsRes = await client.query(
        `SELECT
           r.id,
           r.loan_id,
           r.due_date,
           r.amount_paid,
           r.payment_date,
           r.status,
           r.created_at,
           r.updated_at
         FROM senteloans_institution_loan_repayments r
         WHERE r.loan_id = $1
         ORDER BY r.due_date ASC, r.created_at ASC`,
        [loanId],
      )

      const repayments = rowsRes.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        loan_id: String(row.loan_id || ""),
        due_date: row.due_date != null ? String(row.due_date).slice(0, 10) : "",
        amount_paid: Number(row.amount_paid ?? 0),
        payment_date: row.payment_date != null ? String(row.payment_date).slice(0, 10) : null,
        status: String(row.status || "Pending"),
        created_at: row.created_at != null ? String(row.created_at) : "",
        updated_at: row.updated_at != null ? String(row.updated_at) : null,
      }))

      return { repayments }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "sacco_loans.repayments.denied", { method: "GET", apiPath, status: statusCode, error: result.error })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (result && "notFound" in result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    apiLog("info", "sacco_loans.repayments.success", {
      method: "GET",
      apiPath,
      status: 200,
      loanId,
      count: result.repayments.length,
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.repayments.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
