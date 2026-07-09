import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { hasPermission, isSuperAdmin, resolveActorContext, scopeWhere, SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"
import { auditLogger } from "@/lib/audit/audit-logger"
import { appendSaccoLoanListFilters } from "@/lib/sacco-loans/query-filters"
import { notifySaccoLoanCreated } from "@/lib/notifications/sacco-loan-events"

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
    const loanType = (url.searchParams.get("loan_type") || "").trim().toLowerCase()
    const remainingTenure = (url.searchParams.get("remainingTenure") || "").trim()
    const applicationDateStart = (url.searchParams.get("applicationDateStart") || "").trim()
    const applicationDateEnd = (url.searchParams.get("applicationDateEnd") || "").trim()
    const nextPaymentDateStart = (url.searchParams.get("nextPaymentDateStart") || "").trim()
    const nextPaymentDateEnd = (url.searchParams.get("nextPaymentDateEnd") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw
      ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_sacco_loans")
      if (!allowed) return { error: "missing_permission:view_sacco_loans" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const scoped = scopeWhere({ tableAlias: "l", actor, selectedBranchIds, startIndex: 1 })
      let where = scoped.where
      let params = scoped.values
      let idx = scoped.nextIndex

      ;({ where, params, idx } = appendSaccoLoanListFilters({
        where,
        params,
        idx,
        status,
        loanType,
        remainingTenure,
        applicationDateStart,
        applicationDateEnd,
        nextPaymentDateStart,
        nextPaymentDateEnd,
        q,
      }))

      const countRes = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM institution_loans l
         LEFT JOIN third_party_agents tpa ON tpa.id = l.third_party_agent_id
         WHERE ${where}`,
        params,
      )
      const total = Number(countRes.rows[0]?.c || 0)
      const offset = (page - 1) * pageSize

      const dataRes = await client.query(
        `SELECT
           l.id,
           l.third_party_agent_id,
           l.loan_product,
           l.principal_amount,
           l.interest_rate,
           l.tenure_months,
           l.remaining_tenure_months,
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
           COALESCE(tpa.name, '') AS third_party_agent_name
         FROM institution_loans l
         LEFT JOIN third_party_agents tpa ON tpa.id = l.third_party_agent_id
         WHERE ${where}
         ORDER BY l.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      )

      const items = dataRes.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        third_party_agent_id: String(row.third_party_agent_id || ""),
        third_party_agent_name: String(row.third_party_agent_name || ""),
        loan_product: row.loan_product != null ? String(row.loan_product) : null,
        principal_amount: Number(row.principal_amount || 0),
        interest_rate: Number(row.interest_rate || 0),
        tenure_months: Number(row.tenure_months || 0),
        remaining_tenure_months: Number(row.remaining_tenure_months ?? row.tenure_months ?? 0),
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
    const third_party_agent_id = String(body.thirdPartyAgentId ?? body.third_party_agent_id ?? "").trim()
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
    const interest_amount_raw = Number(body.interestAmount ?? body.interest_amount)
    const interest_amount =
      Number.isFinite(interest_amount_raw) && interest_amount_raw >= 0
        ? Math.round((interest_amount_raw + Number.EPSILON) * 100) / 100
        : null
    const monthly_raw = Number(body.monthlyPayment ?? body.monthly_payment)
    const monthly_payment =
      Number.isFinite(monthly_raw) && monthly_raw > 0 ? Math.round((monthly_raw + Number.EPSILON) * 100) / 100 : null
    const status = "Applied"
    const loan_type_raw = String(body.loanType ?? body.loan_type ?? "normal").trim().toLowerCase()
    const loan_type = VALID_LOAN_TYPES.has(loan_type_raw) ? loan_type_raw : "normal"
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : ""
    const collateral_raw = body.collateralDescription ?? body.collateral_description
    const collateral_description =
      typeof collateral_raw === "string" && collateral_raw.trim() ? collateral_raw.trim() : null
    const application_date = String(body.applicationDate ?? body.application_date ?? "").trim()

    if (!UUID_REGEX.test(third_party_agent_id)) {
      return NextResponse.json({ error: "invalid_third_party_agent_id" }, { status: 400 })
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
    if (!total_amount) {
      return NextResponse.json({ error: "invalid_total_amount" }, { status: 400 })
    }
    if (interest_amount === null) {
      return NextResponse.json({ error: "invalid_interest_amount" }, { status: 400 })
    }
    if (!monthly_payment) {
      return NextResponse.json({ error: "invalid_monthly_payment" }, { status: 400 })
    }
    if (total_amount < principal_amount) {
      return NextResponse.json({ error: "total_below_principal" }, { status: 400 })
    }
    if (Math.abs(total_amount - principal_amount - interest_amount) > 0.01) {
      return NextResponse.json({ error: "repayment_breakdown_mismatch" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(application_date)) {
      return NextResponse.json({ error: "invalid_application_date" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, { activeOnly: false })
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }
      if (isSuperAdmin(actor)) return { error: SUPER_ADMIN_WRITE_BLOCKED }
      const allowed = await hasPermission(client, actor, "create_sacco_loan")
      if (!allowed) return { error: "missing_permission:create_sacco_loan" as const }

      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const branchCheck = await assertBranchActive(client, actor.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error,
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const agentRes = await client.query(
        `SELECT id, institution_id, branch_id, status, name
         FROM third_party_agents
         WHERE id = $1 AND institution_id = $2
         LIMIT 1`,
        [third_party_agent_id, actor.institution_id],
      )
      const crow = agentRes.rows[0] as { branch_id?: string; name?: string } | undefined
      if (!crow) return { error: "third_party_agent_not_found" as const }
      const cBranch = String(crow.branch_id || "")
      if (!isSuperAdmin(actor) && cBranch !== String(actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }
      if (!UUID_REGEX.test(cBranch)) return { error: "third_party_agent_branch_missing" as const }

      const ins = await client.query(
        `INSERT INTO institution_loans (
           institution_id, branch_id, third_party_agent_id,
           loan_product, principal_amount, interest_rate, tenure_months, remaining_tenure_months,
           monthly_payment, total_amount, outstanding_balance, status,
           loan_type, purpose, collateral_description, application_date,
           disbursement_balance,
           created_by
         ) VALUES (
           $1, $2, $3,
           $4, $5, $6, $7, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16,
           $17
         )
         RETURNING id`,
        [
          actor.institution_id,
          cBranch,
          third_party_agent_id,
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
      await auditLogger.logInsert(
        "institution_loans",
        String(row.id),
        {
          third_party_agent_id,
          loan_product,
          principal_amount,
          interest_rate,
          tenure_months,
          monthly_payment,
          total_amount,
          outstanding_balance: 0,
          status,
          loan_type,
          purpose: purpose || null,
          collateral_description,
          application_date,
          disbursement_balance: principal_amount,
        },
        actor.institution_id,
        actor.id,
        { branch_id: cBranch },
        client
      )
      return {
        ok: true as const,
        id: String(row.id),
        postCommit: {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: cBranch,
          agent: {
            id: third_party_agent_id,
            name: String(crow.name || "").trim() || "External lender",
          },
          loan: {
            id: String(row.id),
            principal_amount,
            loan_product,
            loan_type,
          },
        },
      }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "missing_permission:create_sacco_loan" ||
        err === "cross_branch_operation_forbidden" ||
        err === "user_not_linked" ||
        err === "staff_inactive" ||
        err === "branch_inactive" ||
        err === "branch_not_found" ||
        err === SUPER_ADMIN_WRITE_BLOCKED
          ? 403
          : err === "staff_not_found" || err === "client_not_found"
            ? 404
            : err === "insert_failed"
              ? 500
              : 400
      apiLog("warn", "sacco_loans.create.denied", { method: "POST", apiPath, status: statusCode, error: err })
      const payload: Record<string, unknown> = { error: err }
      if ("staffStatus" in result && result.staffStatus) payload.staff_status = result.staffStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus as BranchStatus
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "sacco_loans.create.success", {
      method: "POST",
      apiPath,
      status: 201,
      loanId: result.id,
      authUserId: session.user.authUserId,
    })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifySaccoLoanCreated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            agent: ctx.agent,
            loan: ctx.loan,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "sacco_loans.create.notifications_dispatched"
            : "sacco_loans.create.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            loanId: result.id,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "sacco_loans.create.notifications_failed", {
          method: "POST",
          apiPath,
          status: 201,
          loanId: result.id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    return NextResponse.json({ ok: true, id: result.id }, { status: 201 })
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
