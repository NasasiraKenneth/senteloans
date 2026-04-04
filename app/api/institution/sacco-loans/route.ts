import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
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

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return permRes.rowCount > 0
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

const VALID_LOAN_TYPES = new Set(["normal", "top_up", "buy_off", "sell_off"])

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "sacco_loans.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "sacco_loans.create.denied", { method: "POST", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const client_id = String(body.clientId ?? body.client_id ?? "").trim()
    const loan_product_raw =
      typeof body.loanProduct === "string"
        ? body.loanProduct
        : typeof body.loan_product === "string"
          ? body.loan_product
          : ""
    const loan_product = loan_product_raw.trim() || null
    const principal_amount = Number(body.principalAmount ?? body.principal_amount)
    const interest_rate = Number(body.interestRate ?? body.interest_rate)
    const tenure_months = Math.floor(Number(body.tenureMonths ?? body.tenure_months))
    const total_raw = Number(body.totalAmount ?? body.total_amount)
    const total_amount =
      Number.isFinite(total_raw) && total_raw > 0 ? Math.round((total_raw + Number.EPSILON) * 100) / 100 : null
    const monthly_raw = Number(body.monthlyPayment ?? body.monthly_payment)
    const monthly_payment =
      Number.isFinite(monthly_raw) && monthly_raw > 0 ? Math.round((monthly_raw + Number.EPSILON) * 100) / 100 : null
    const status_raw = String(body.status ?? "Applied").trim()
    const status = VALID_STATUSES.has(status_raw) ? status_raw : ""
    const loan_type_raw = String(body.loanType ?? body.loan_type ?? "normal").trim().toLowerCase()
    const loan_type = VALID_LOAN_TYPES.has(loan_type_raw) ? loan_type_raw : "normal"
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : ""
    const collateral_raw = body.collateralDescription ?? body.collateral_description
    const collateral_description =
      typeof collateral_raw === "string" && collateral_raw.trim() ? collateral_raw.trim() : null
    const application_date = String(body.applicationDate ?? body.application_date ?? "").trim()

    if (!UUID_REGEX.test(client_id)) {
      return NextResponse.json({ error: "invalid_client_id" }, { status: 400 })
    }
    if (!Number.isFinite(principal_amount) || principal_amount <= 0) {
      return NextResponse.json({ error: "invalid_principal_amount" }, { status: 400 })
    }
    if (!Number.isFinite(interest_rate) || interest_rate < 0) {
      return NextResponse.json({ error: "invalid_interest_rate" }, { status: 400 })
    }
    if (!Number.isFinite(tenure_months) || tenure_months <= 0) {
      return NextResponse.json({ error: "invalid_tenure_months" }, { status: 400 })
    }
    if (!status) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(application_date)) {
      return NextResponse.json({ error: "invalid_application_date" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "create_loan")
      if (!allowed) return { error: "missing_permission:create_loan" as const }

      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const clientRes = await client.query(
        `SELECT id, institution_id, branch_id, status
         FROM senteloans_clients
         WHERE id = $1 AND institution_id = $2
         LIMIT 1`,
        [client_id, actor.institution_id],
      )
      const crow = clientRes.rows[0] as { branch_id?: string } | undefined
      if (!crow) return { error: "client_not_found" as const }
      const cBranch = String(crow.branch_id || "")
      if (!isSuperAdmin && cBranch !== String(actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }
      if (!UUID_REGEX.test(cBranch)) return { error: "client_branch_missing" as const }

      const ins = await client.query(
        `INSERT INTO senteloans_institution_loans (
           institution_id, branch_id, client_id,
           loan_product, principal_amount, interest_rate, tenure_months,
           monthly_payment, total_amount, outstanding_balance, status,
           loan_type, purpose, collateral_description, application_date,
           disbursement_balance,
           created_by
         ) VALUES (
           $1, $2, $3,
           $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16,
           $17
         )
         RETURNING id`,
        [
          actor.institution_id,
          cBranch,
          client_id,
          loan_product,
          principal_amount,
          interest_rate,
          tenure_months,
          monthly_payment,
          total_amount,
          0,
          status,
          loan_type,
          purpose || null,
          collateral_description,
          application_date,
          principal_amount,
          actor.id,
        ],
      )
      const row = ins.rows[0] as { id?: string } | undefined
      if (!row?.id) return { error: "insert_failed" as const }
      return { ok: true as const, id: String(row.id) }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "missing_permission:create_loan" || err === "cross_branch_operation_forbidden" || err === "user_not_linked"
          ? 403
          : err === "client_not_found"
            ? 404
            : err === "insert_failed"
              ? 500
              : 400
      apiLog("warn", "sacco_loans.create.denied", { method: "POST", apiPath, status: statusCode, error: err })
      return NextResponse.json({ error: err }, { status: statusCode })
    }

    apiLog("info", "sacco_loans.create.success", {
      method: "POST",
      apiPath,
      status: 201,
      loanId: result.id,
      authUserId: session.user.authUserId,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.create.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
