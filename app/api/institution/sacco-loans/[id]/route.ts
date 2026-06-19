import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"

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
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
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
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return permRes.rowCount > 0
}

const APPROVE_REJECT_FROM = new Set(["Applied", "Under Review", "Reviewed"])

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function addCalendarMonthsToIsoDate(isoDate: string, months: number): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!parts) return null
  const y = Number(parts[1])
  const mo = Number(parts[2])
  const d = Number(parts[3])
  if (!Number.isFinite(months) || months < 0) return null
  const out = new Date(y, mo - 1 + months, d, 12, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${out.getFullYear()}-${pad(out.getMonth() + 1)}-${pad(out.getDate())}`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id || !UUID_REGEX.test(id)) {
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
      const allowed = await hasPermission(client, actor, "view_sacco_loans")
      if (!allowed) return { error: "missing_permission:view_sacco_loans" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [id, actor.institution_id]
      if (!isSuperAdmin) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

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
         FROM institution_loans l
         LEFT JOIN clients c ON c.id = l.client_id
         WHERE ${where}
         LIMIT 1`,
        qparams,
      )
      const row = dataRes.rows[0] as Record<string, unknown> | undefined
      if (!row) return { notFound: true as const }

      return {
        loan: {
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
        },
      }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "sacco_loans.detail.denied", { method: "GET", apiPath, status: statusCode, error: result.error })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (result && "notFound" in result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    apiLog("info", "sacco_loans.detail.success", { method: "GET", apiPath, status: 200, id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.detail.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const nextStatus = String(body.status ?? "").trim()
    if (nextStatus !== "Approved" && nextStatus !== "Rejected" && nextStatus !== "Active") {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
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
      const qparams: unknown[] = [id, actor.institution_id]
      if (!isSuperAdmin) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const updateWhere = isSuperAdmin
        ? "id = $2 AND institution_id = $3"
        : "id = $2 AND institution_id = $3 AND branch_id = $4"
      const updateParams = isSuperAdmin
        ? [actor.id, id, actor.institution_id]
        : [actor.id, id, actor.institution_id, actor.branch_id]

      if (nextStatus === "Active") {
        const ok = await hasPermission(client, actor, "disburse_sacco_loan")
        if (!ok) return { error: "missing_permission:disburse_sacco_loan" as const }

        const nextPaymentRaw = String(
          body.next_payment_date ?? body.nextPaymentDate ?? "",
        ).trim()
        const maturityRaw = String(body.maturity_date ?? body.maturityDate ?? "").trim()
        const monthlyPayment = Number(body.monthly_payment ?? body.monthlyPayment)
        const nextPaymentDate = nextPaymentRaw.slice(0, 10)
        const maturityDate = maturityRaw.slice(0, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nextPaymentDate)) {
          return { error: "invalid_next_payment_date" as const }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(maturityDate)) {
          return { error: "invalid_maturity_date" as const }
        }
        if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
          return { error: "invalid_monthly_payment" as const }
        }

        const loanRes = await client.query<{ status: string; tenure_months: number; next_payment_date: string | null; maturity_date: string | null; monthly_payment: number | null }>(
          `SELECT l.status, l.tenure_months, l.next_payment_date, l.maturity_date, l.monthly_payment FROM institution_loans l WHERE ${where} LIMIT 1`,
          qparams,
        )
        const row = loanRes.rows[0]
        if (!row) return { error: "not_found" as const }
        if (String(row.status || "") !== "Fully Disbursed") {
          return { error: "invalid_status_transition" as const }
        }

        const tenureMonths = Math.max(0, Math.floor(Number(row.tenure_months ?? 0)))
        const expectedMaturity = addCalendarMonthsToIsoDate(nextPaymentDate, tenureMonths)
        if (!expectedMaturity || expectedMaturity !== maturityDate) {
          return { error: "maturity_date_mismatch" as const }
        }

        const activeUpdateWhere = isSuperAdmin
          ? "id = $2 AND institution_id = $3"
          : "id = $2 AND institution_id = $3 AND branch_id = $7"
        const activeUpdateParams = isSuperAdmin
          ? [actor.id, id, actor.institution_id, nextPaymentDate, maturityDate, monthlyPayment]
          : [actor.id, id, actor.institution_id, nextPaymentDate, maturityDate, monthlyPayment, actor.branch_id]

        await client.query(
          `UPDATE institution_loans
           SET status = 'Active'::loan_status_type,
               next_payment_date = $4::date,
               maturity_date = $5::date,
               monthly_payment = $6,
               modified_by = $1,
               updated_at = NOW()
           WHERE ${activeUpdateWhere}`,
          activeUpdateParams,
        )
        await auditLogger.logUpdate(
          "institution_loans",
          id,
          {
            status: row.status,
            next_payment_date: row.next_payment_date,
            maturity_date: row.maturity_date,
            monthly_payment: row.monthly_payment,
          },
          {
            status: "Active",
            next_payment_date: nextPaymentDate,
            maturity_date: maturityDate,
            monthly_payment: Number(monthlyPayment),
          },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
        return { ok: true as const, status: "Active" as const }
      }

      if (nextStatus === "Approved") {
        const ok = await hasPermission(client, actor, "approve_sacco_loan")
        if (!ok) return { error: "missing_permission:approve_sacco_loan" as const }
      } else {
        const ok = await hasPermission(client, actor, "reject_sacco_loan")
        if (!ok) return { error: "missing_permission:reject_sacco_loan" as const }
      }

      const loanRes = await client.query<{ status: string; approved_at: string | null; rejected_at: string | null }>(
        `SELECT l.status, l.approved_at, l.rejected_at FROM institution_loans l WHERE ${where} LIMIT 1`,
        qparams,
      )
      const row = loanRes.rows[0]
      if (!row) return { error: "not_found" as const }

      const current = String(row.status || "")
      if (!APPROVE_REJECT_FROM.has(current)) {
        return { error: "invalid_status_transition" as const }
      }

      if (nextStatus === "Approved") {
        const approvedAt = new Date().toISOString()
        await client.query(
          `UPDATE institution_loans
           SET status = 'Approved'::loan_status_type,
               approved_at = NOW(),
               rejected_at = NULL,
               modified_by = $1,
               updated_at = NOW()
           WHERE ${updateWhere}`,
          updateParams,
        )
        await auditLogger.logUpdate(
          "institution_loans",
          id,
          { status: row.status, approved_at: row.approved_at, rejected_at: row.rejected_at },
          { status: "Approved", approved_at: approvedAt, rejected_at: null },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
      } else {
        const rejectedAt = new Date().toISOString()
        await client.query(
          `UPDATE institution_loans
           SET status = 'Rejected'::loan_status_type,
               rejected_at = NOW(),
               approved_at = NULL,
               modified_by = $1,
               updated_at = NOW()
           WHERE ${updateWhere}`,
          updateParams,
        )
        await auditLogger.logUpdate(
          "institution_loans",
          id,
          { status: row.status, approved_at: row.approved_at, rejected_at: row.rejected_at },
          { status: "Rejected", approved_at: null, rejected_at: rejectedAt },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
      }

      return { ok: true as const, status: nextStatus }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "missing_permission:approve_sacco_loan" ||
          err === "missing_permission:reject_sacco_loan" ||
          err === "missing_permission:disburse_sacco_loan" ||
          err === "missing_permission:view_sacco_loans"
          ? 403
          : err === "user_not_linked" || err === "cross_branch_operation_forbidden"
            ? 403
            : err === "not_found"
              ? 404
              : err === "actor_branch_missing"
                ? 400
                : 400
      apiLog("warn", "sacco_loans.patch.denied", { method: "PATCH", apiPath, status: statusCode, error: err })
      return NextResponse.json({ error: err }, { status: statusCode })
    }

    apiLog("info", "sacco_loans.patch.success", { method: "PATCH", apiPath, status: 200, id, status: result.status })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.patch.error", { method: "PATCH", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
