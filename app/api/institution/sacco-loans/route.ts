import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

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

const VALID_STATUSES = new Set([
  "Applied",
  "Under Review",
  "Reviewed",
  "Approved",
  "Partially Disbursed",
  "Fully Disbursed",
  "Active",
  "Closed",
  "Defaulted",
  "Rejected",
])

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 200)
    const q = (url.searchParams.get("q") || "").trim()
    const statusRaw = (url.searchParams.get("status") || "").trim()
    const status = VALID_STATUSES.has(statusRaw) ? statusRaw : ""

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "l.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (!isSuperAdmin) {
        where += ` AND l.branch_id = $${idx++}`
        params.push(actor.branch_id)
      }

      if (status) {
        where += ` AND l.status = $${idx++}`
        params.push(status)
      }

      if (q) {
        where += ` AND (
          COALESCE(c.name, '') ILIKE $${idx}
          OR COALESCE(l.loan_product, '') ILIKE $${idx}
          OR COALESCE(l.purpose, '') ILIKE $${idx}
        )`
        params.push(`%${q}%`)
        idx++
      }

      const countRes = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM senteloans_institution_loans l
         LEFT JOIN senteloans_clients c ON c.id = l.client_id
         WHERE ${where}`,
        params,
      )
      const total = Number(countRes.rows[0]?.c || 0)
      const offset = (page - 1) * pageSize

      const dataRes = await client.query(
        `SELECT
           l.id,
           l.client_id,
           l.loan_product,
           l.principal_amount,
           l.interest_rate,
           l.tenure_months,
           l.monthly_payment,
           l.total_amount,
           l.outstanding_balance,
           l.status,
           l.loan_type,
           l.purpose,
           l.collateral_description,
           l.application_date,
           l.approved_at,
           l.rejected_at,
           l.disbursement_balance,
           l.disbursement_date,
           l.maturity_date,
           l.next_payment_date,
           l.overdue_days,
           l.created_at,
           l.updated_at,
           COALESCE(c.name, '') AS client_name
         FROM senteloans_institution_loans l
         LEFT JOIN senteloans_clients c ON c.id = l.client_id
         WHERE ${where}
         ORDER BY l.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      )

      const items = dataRes.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        client_id: String(row.client_id || ""),
        client_name: String(row.client_name || ""),
        loan_product: row.loan_product != null ? String(row.loan_product) : null,
        principal_amount: Number(row.principal_amount || 0),
        interest_rate: Number(row.interest_rate || 0),
        tenure_months: Number(row.tenure_months || 0),
        monthly_payment: row.monthly_payment != null ? Number(row.monthly_payment) : null,
        total_amount: row.total_amount != null ? Number(row.total_amount) : null,
        outstanding_balance: Number(row.outstanding_balance || 0),
        status: String(row.status || ""),
        loan_type: String(row.loan_type || "normal"),
        purpose: row.purpose != null ? String(row.purpose) : null,
        collateral_description: row.collateral_description != null ? String(row.collateral_description) : null,
        application_date: row.application_date != null ? String(row.application_date) : null,
        approved_at: row.approved_at != null ? String(row.approved_at) : null,
        rejected_at: row.rejected_at != null ? String(row.rejected_at) : null,
        disbursement_balance: Number(row.disbursement_balance ?? 0),
        disbursement_date: row.disbursement_date != null ? String(row.disbursement_date) : null,
        maturity_date: row.maturity_date != null ? String(row.maturity_date) : null,
        next_payment_date: row.next_payment_date != null ? String(row.next_payment_date) : null,
        overdue_days: Number(row.overdue_days ?? 0),
        created_at: row.created_at != null ? String(row.created_at) : "",
        updated_at: row.updated_at != null ? String(row.updated_at) : null,
      }))

      return { items, total, page, pageSize }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "sacco_loans.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "sacco_loans.list.success", { method: "GET", apiPath, status: 200, count: result.items?.length || 0 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
