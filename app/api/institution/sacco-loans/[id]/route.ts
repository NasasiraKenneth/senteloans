import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { hasPermission, isSuperAdmin, resolveActorContext, SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"
import { auditLogger } from "@/lib/audit/audit-logger"
import { notifySaccoLoanActivated } from "@/lib/notifications/sacco-loan-events"

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
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [id, actor.institution_id]
      if (!isSuperAdmin(actor)) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const dataRes = await client.query(
        `SELECT
           l.id,
           l.third_party_agent_id,
           l.loan_product,
           l.principal_amount,
           l.interest_rate,
           l.tenure_months,
           COALESCE(l.remaining_tenure_months, l.tenure_months) AS remaining_tenure_months,
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
         LIMIT 1`,
        qparams,
      )
      const row = dataRes.rows[0] as Record<string, unknown> | undefined
      if (!row) return { notFound: true as const }

      const agentId = String(row.third_party_agent_id || "")
      const agentName = String(row.third_party_agent_name || "")
      const tenureMonths = Number(row.tenure_months || 0)
      const remainingTenure = Number(row.remaining_tenure_months ?? row.tenure_months ?? 0)

      return {
        loan: {
          id: String(row.id || ""),
          third_party_agent_id: agentId,
          third_party_agent_name: agentName,
          client_id: agentId,
          client_name: agentName,
          loan_product: row.loan_product != null ? String(row.loan_product) : null,
          principal_amount: Number(row.principal_amount || 0),
          interest_rate: Number(row.interest_rate || 0),
          tenure_months: tenureMonths,
          remaining_tenure_months: remainingTenure,
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
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const branchCheck = await assertBranchActive(client, actor.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error,
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const isSA = isSuperAdmin(actor)
      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [id, actor.institution_id]
      if (!isSA) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const updateWhere = isSA
        ? "id = $2 AND institution_id = $3"
        : "id = $2 AND institution_id = $3 AND branch_id = $4"
      const updateParams = isSA
        ? [actor.id, id, actor.institution_id]
        : [actor.id, id, actor.institution_id, actor.branch_id]

      if (nextStatus === "Active") {
        const ok = await hasPermission(client, actor, "activate_sacco_loan")
        if (!ok) return { error: "missing_permission:activate_sacco_loan" as const }

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

        const loanRes = await client.query<{
          status: string
          tenure_months: number
          remaining_tenure_months: number | null
          next_payment_date: string | null
          maturity_date: string | null
          monthly_payment: number | null
          loan_product: string | null
          third_party_agent_id: string
          third_party_agent_name: string
        }>(
          `SELECT l.status, l.tenure_months, l.remaining_tenure_months, l.next_payment_date, l.maturity_date,
                  l.monthly_payment, l.loan_product, l.third_party_agent_id,
                  COALESCE(tpa.name, '') AS third_party_agent_name
           FROM institution_loans l
           LEFT JOIN third_party_agents tpa ON tpa.id = l.third_party_agent_id
           WHERE ${where}
           LIMIT 1`,
          qparams,
        )
        const row = loanRes.rows[0]
        if (!row) return { error: "not_found" as const }
        if (String(row.status || "") !== "Fully Disbursed") {
          return { error: "invalid_status_transition" as const }
        }

        const remainingTenureMonths = Math.max(
          0,
          Math.floor(Number(row.remaining_tenure_months ?? row.tenure_months ?? 0)),
        )
        const expectedMaturity = addCalendarMonthsToIsoDate(nextPaymentDate, remainingTenureMonths)
        if (!expectedMaturity || expectedMaturity !== maturityDate) {
          return { error: "maturity_date_mismatch" as const }
        }

        const activeUpdateWhere = isSA
          ? "id = $2 AND institution_id = $3"
          : "id = $2 AND institution_id = $3 AND branch_id = $7"
        const activeUpdateParams = isSA
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
          { branch_id: actor.branch_id },
          client
        )
        return {
          ok: true as const,
          status: "Active" as const,
          postCommit: {
            actorId: actor.id,
            institutionId: actor.institution_id,
            branchId: actor.branch_id,
            agent: {
              id: String(row.third_party_agent_id || ""),
              name: String(row.third_party_agent_name || "").trim() || "External lender",
            },
            loan: {
              id,
              loan_product: row.loan_product != null ? String(row.loan_product) : null,
              next_payment_date: nextPaymentDate,
              maturity_date: maturityDate,
              monthly_payment: Number(monthlyPayment),
            },
          },
        }
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
          { branch_id: actor.branch_id },
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
          { branch_id: actor.branch_id },
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
          err === "missing_permission:activate_sacco_loan" ||
          err === "missing_permission:disburse_sacco_loan" ||
          err === "missing_permission:view_sacco_loans" ||
          err === "staff_inactive" ||
          err === "branch_inactive" ||
          err === "branch_not_found" ||
          err === SUPER_ADMIN_WRITE_BLOCKED
          ? 403
          : err === "user_not_linked" || err === "cross_branch_operation_forbidden"
            ? 403
            : err === "staff_not_found"
              ? 404
            : err === "not_found"
              ? 404
              : err === "actor_branch_missing"
                ? 400
                : 400
      apiLog("warn", "sacco_loans.patch.denied", { method: "PATCH", apiPath, status: statusCode, error: err })
      const payload: Record<string, unknown> = { error: err }
      if ("staffStatus" in result && result.staffStatus) payload.staff_status = result.staffStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus as BranchStatus
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "sacco_loans.patch.success", { method: "PATCH", apiPath, status: 200, id, loanStatus: result.status })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifySaccoLoanActivated({
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
            ? "sacco_loans.activate.notifications_dispatched"
            : "sacco_loans.activate.notifications_partial",
          {
            method: "PATCH",
            apiPath,
            status: 200,
            loanId: id,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "sacco_loans.activate.notifications_failed", {
          method: "PATCH",
          apiPath,
          status: 200,
          loanId: id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }
    }

    return NextResponse.json({ ok: true, status: result.status })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.patch.error", { method: "PATCH", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
