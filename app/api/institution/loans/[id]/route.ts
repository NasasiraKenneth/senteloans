import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import {
  buildRepaymentSchedule,
  calculateCompleteDisbursementAmount,
  calculateLoanTerms,
} from "@/lib/loans/calculations"
import { apiLog, getApiPath } from "@/lib/api/api-log"

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

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
       AND u.status = 'Active'
     LIMIT 1`,
    [authUserId]
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
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

/** Normalize DB date (Date or string) to YYYY-MM-DD. */
function toDateString(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = v.getMonth() + 1
    const d = v.getDate()
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  const s = String(v ?? "").slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return new Date().toISOString().slice(0, 10)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.detail.invalid_request", { method: "GET", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loans.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, monthly_payment, total_amount, outstanding_balance, disbursement_balance, status, loan_type, purpose, collateral_description, application_date, approved_at, disbursement_date, maturity_date, next_payment_date, overdue_days, created_by, created_at, updated_at
         FROM senteloans_loans WHERE id = $1`,
        [id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return null
      if (String(loan.institution_id) !== String(actor.institution_id)) return null
      if (!isSuperAdmin && String(loan.branch_id) !== String(actor.branch_id)) return null

      let member_name = ""
      let member_number = ""
      if (loan.member_id) {
        const mRes = await client.query(`SELECT id, full_name, member_number FROM senteloans_members WHERE id = $1`, [loan.member_id])
        member_name = mRes.rows[0]?.full_name || ""
        member_number = mRes.rows[0]?.member_number || ""
      }

      let product_name = ""
      let processing_fee_percentage = 0
      if (loan.loan_product_id) {
        const pRes = await client.query(
          `SELECT id, product_name, processing_fee_percentage
           FROM senteloans_loan_products
           WHERE id = $1`,
          [loan.loan_product_id]
        )
        product_name = pRes.rows[0]?.product_name || ""
        processing_fee_percentage = Number(pRes.rows[0]?.processing_fee_percentage || 0)
      }

      const guarsRes = await client.query(
        `SELECT id, guarantor_member_id, guaranteed_amount, status FROM senteloans_loan_guarantors WHERE loan_id = $1`,
        [loan.id]
      )
      const guarsRows = guarsRes.rows
      let guarantors: Array<{ member_id: string; member_name: string; guaranteed_amount: number; status: string }> = []
      if (guarsRows.length > 0) {
        const gIds = [...new Set(guarsRows.map((g: { guarantor_member_id: string }) => g.guarantor_member_id))]
        const gMembersRes = await client.query(`SELECT id, full_name FROM senteloans_members WHERE id = ANY($1::uuid[])`, [gIds])
        const gMap: Record<string, string> = Object.fromEntries(gMembersRes.rows.map((m: { id: string; full_name: string }) => [m.id, m.full_name]))
        guarantors = guarsRows.map((g: { guarantor_member_id: string; guaranteed_amount: number; status: string }) => ({
          member_id: g.guarantor_member_id,
          member_name: gMap[g.guarantor_member_id] || "",
          guaranteed_amount: Number(g.guaranteed_amount || 0),
          status: g.status,
        }))
      }

      const repRes = await client.query(
        `SELECT id, due_date, total_amount, amount_paid, status FROM senteloans_loan_repayments WHERE loan_id = $1 ORDER BY due_date ASC`,
        [loan.id]
      )
      const repayments = repRes.rows
      const total_installments = repayments.length
      const total_due = repayments.reduce((s: number, r: { total_amount?: string }) => s + Number(r.total_amount || 0), 0)
      const total_paid = repayments.reduce((s: number, r: { amount_paid?: string }) => s + Number(r.amount_paid || 0), 0)
      const total_outstanding = Math.max(0, total_due - total_paid)
      const overdue_count = repayments.filter((r: { status: string }) => String(r.status) === "Overdue").length
      const next_due_date = repayments.find((r: { status: string }) => String(r.status) !== "Paid")?.due_date ?? null

      const settlementRes = await client.query(
        `SELECT
           s.id,
           s.new_loan_id,
           s.settled_loan_id,
           s.external_lender_id,
           c.name AS external_lender_name,
           s.settlement_amount,
           s.settlement_type,
           s.settlement_status,
           s.created_at,
           l.application_id AS settled_application_id
         FROM senteloans_loan_settlements s
         LEFT JOIN senteloans_loans l ON l.id = s.settled_loan_id
         LEFT JOIN senteloans_clients c ON c.id = s.external_lender_id
         WHERE s.new_loan_id = $1 OR (s.settled_loan_id = $1 AND s.new_loan_id IS NULL)
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [loan.id]
      )
      const settlement = settlementRes.rows[0] || null
      const disbursementPreview = calculateCompleteDisbursementAmount({
        principal: Number(loan.principal_amount || 0),
        processingFeePercentage: processing_fee_percentage,
        settlementAmount: Number(settlement?.settlement_amount || 0),
        loanType: loan.loan_type,
      })
      const disbursedTotalsRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total_disbursed
         FROM senteloans_loan_disbursements
         WHERE loan_id = $1
           AND NOT (
             disbursement_type = 'partial loan disburse'
             AND notes = 'Partial disbursement to settle previous loan'
           )`,
        [loan.id]
      )
      const totalDisbursed = Number(disbursedTotalsRes.rows[0]?.total_disbursed || 0)
      const computedRemainingDisbursementBalance = Math.max(
        0,
        Number(disbursementPreview.completeDisbursementAmount || 0) - Math.max(0, totalDisbursed)
      )
      const remainingDisbursementBalance = Math.max(
        0,
        Number(
          String(loan.status || "") === "Partially Disbursed"
            ? (loan.disbursement_balance ?? computedRemainingDisbursementBalance)
            : computedRemainingDisbursementBalance
        )
      )
      const eligibilityRes = await client.query(
        `SELECT id, eligibility, is_eligible, reviewed_at, reviewed_by, updated_at
         FROM senteloans_loan_eligibility_reviews
         WHERE loan_id = $1
         ORDER BY created_at ASC`,
        [loan.id]
      )
      const eligibilityReviews = eligibilityRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        eligibility: r.eligibility,
        is_eligible: Boolean(r.is_eligible),
        reviewed_at: r.reviewed_at ?? null,
        reviewed_by: r.reviewed_by ?? null,
        updated_at: r.updated_at ?? null,
      }))

      return {
        loan: {
          id: loan.id,
          application_id: loan.application_id,
          member_id: loan.member_id,
          member_name,
          member_number,
          loan_product_id: loan.loan_product_id,
          product_name,
          principal_amount: loan.principal_amount,
          interest_rate: loan.interest_rate,
          tenure_months: loan.tenure_months,
          monthly_payment: loan.monthly_payment,
          total_amount: loan.total_amount,
          outstanding_balance: loan.outstanding_balance,
          status: loan.status,
          loan_type: loan.loan_type,
          purpose: loan.purpose,
          collateral_description: loan.collateral_description,
          application_date: loan.application_date,
          approved_at: loan.approved_at,
          disbursement_date: loan.disbursement_date,
          maturity_date: loan.maturity_date,
          next_payment_date: loan.next_payment_date,
          overdue_days: loan.overdue_days,
          guarantors,
          repayment_summary: {
            total_installments,
            total_due,
            total_paid,
            total_outstanding,
            overdue_count,
            next_due_date,
          },
          settlement: settlement
            ? {
                id: settlement.id,
                new_loan_id: settlement.new_loan_id,
                settled_loan_id: settlement.settled_loan_id,
                settled_application_id: settlement.settled_application_id || null,
                external_lender_id: settlement.external_lender_id || null,
                external_lender_name: settlement.external_lender_name || null,
                settlement_amount: Number(settlement.settlement_amount || 0),
                settlement_type: settlement.settlement_type || null,
                settlement_status: settlement.settlement_status || null,
                created_at: settlement.created_at || null,
              }
            : null,
          disbursement_preview: {
            processing_fee_percentage: disbursementPreview.processingFeePercentage,
            processing_fee_amount: disbursementPreview.processingFeeAmount,
            settlement_amount: disbursementPreview.settlementAmount,
            complete_disbursement_amount: disbursementPreview.completeDisbursementAmount,
            remaining_disbursement_balance: remainingDisbursementBalance,
          },
          eligibility_reviews: eligibilityReviews,
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_loans" ? 403 :
        result.error === "user_not_linked" ? 403 :
        result.error === "actor_branch_missing" ? 400 : 400
      apiLog("warn", "loans.detail.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId, loanId: id })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result) {
      apiLog("warn", "loans.detail.not_found", { method: "GET", apiPath, status: 404, authUserId: session.user.authUserId, loanId: id })
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    apiLog("info", "loans.detail.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId, loanId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.update.invalid_request", { method: "PUT", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loans.update.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const newStatus = typeof body.status === "string" ? body.status.trim() : undefined
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : undefined
    const collateral_description = typeof body.collateral_description === "string" ? body.collateral_description.trim() : undefined
    const eligibility_reviews = Array.isArray(body.eligibility_reviews)
      ? (body.eligibility_reviews as Array<{ id?: string; is_eligible?: boolean }>)
      : []
    const disbursement_mode = PAYMENT_MODES.includes(body.disbursement_mode as typeof PAYMENT_MODES[number])
      ? (body.disbursement_mode as string)
      : "Cash"
    const disbursement_type = typeof body.disbursement_type === "string" ? body.disbursement_type.trim().toLowerCase() : "complete"
    const disbursement_notes = typeof body.notes === "string" ? body.notes.trim() : ""
    const disbursement_amount =
      Number.isFinite(Number(body.disbursement_amount))
        ? Number(body.disbursement_amount)
        : null
    const disbursement_date = typeof body.disbursement_date === "string" && body.disbursement_date.trim()
      ? body.disbursement_date.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const allowedTargets: Record<string, string[]> = {
      Applied: ["Under Review", "Rejected"],
      "Under Review": ["Reviewed", "Rejected"],
      Reviewed: ["Approved", "Rejected"],
      Approved: ["Partially Disbursed", "Fully Disbursed"],
      Rejected: [],
      "Fully Disbursed": [],
      "Partially Disbursed": ["Fully Disbursed"],
      Active: [],
      Closed: [],
      Defaulted: [],
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const permissionByStatus: Record<string, string> = {
        "Under Review": "review_loan",
        Reviewed: "review_loan",
        Approved: "approve_loan",
        Rejected: "reject_loan",
        "Fully Disbursed": "disburse_loan",
        "Partially Disbursed": "disburse_loan",
      }
      const requiredPermission = newStatus ? permissionByStatus[newStatus] || "review_loan" : "review_loan"
      const allowed = await hasPermission(client, actor, requiredPermission)
      if (!allowed) return { error: `missing_permission:${requiredPermission}` as const }
      if (newStatus === "Approved") {
        const canApprove = await hasPermission(client, actor, "approve_loan")
        if (!canApprove) return { error: "missing_permission:approve_loan" as const }
      }

      const [loanRes, actorRes] = await Promise.all([
        client.query(
          `SELECT id, institution_id, branch_id, member_id, status, approved_at, total_amount, principal_amount, interest_rate, tenure_months, loan_product_id, loan_type, disbursement_balance
           FROM senteloans_loans
           WHERE id = $1`,
          [id]
        ),
        client.query(`SELECT id, institution_id, branch_id FROM senteloans_users WHERE id = $1`, [actor.id]),
      ])
      const loan = loanRes.rows[0]
      const actorRow = actorRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (!actorRow) return { error: "user_not_linked" as const }
      if (loan.institution_id !== actorRow.institution_id) return { error: "cross_tenant_operation_forbidden" as const }
      if (!isSuperAdmin && String(loan.branch_id) !== String(actorRow.branch_id)) return { error: "cross_branch_operation_forbidden" as const }

      const updates: Record<string, unknown> = {}
      if (typeof purpose !== "undefined") updates.purpose = purpose
      if (typeof collateral_description !== "undefined") updates.collateral_description = collateral_description
      let eligibilityUpdatesApplied = false

      if (eligibility_reviews.length > 0) {
        const reviewEligibilityPermission = await hasPermission(client, actor, "review_eligibilities")
        if (!reviewEligibilityPermission) return { error: "missing_permission:review_eligibilities" as const }

        for (const row of eligibility_reviews) {
          const reviewId = String(row?.id || "").trim()
          if (!reviewId) continue
          const nextEligible = Boolean(row?.is_eligible)
          const updateRes = await client.query(
            `UPDATE senteloans_loan_eligibility_reviews
             SET is_eligible = $1,
                 reviewed_at = NOW(),
                 reviewed_by = $2,
                 modified_by = $2,
                 updated_at = NOW()
             WHERE id = $3
               AND loan_id = $4`,
            [nextEligible, actor.id, reviewId, id]
          )
          if ((updateRes.rowCount ?? 0) > 0) {
            eligibilityUpdatesApplied = true
            await client.query(
              `INSERT INTO senteloans_audit_logs
                (institution_id, branch_id, user_id, table_name, operation, record_id, new_values)
               VALUES ($1, $2, $3, 'senteloans_loan_eligibility_reviews', 'UPDATE', $4, $5)`,
              [
                actor.institution_id,
                loan.branch_id,
                actor.id,
                reviewId,
                JSON.stringify({ loan_id: id, is_eligible: nextEligible }),
              ]
            )
          }
        }
      }
      let completeDisbursementAmount = 0
      let disbursementContext: null | {
        amount: number
        balanceBefore: number
        balanceAfter: number
        disbursementTypeLabel: string
        notes: string
      } = null
      if (typeof newStatus !== "undefined") {
        const current = String(loan.status)
        if (!Object.prototype.hasOwnProperty.call(allowedTargets, current)) return { error: "invalid_current_status" as const }
        if (!allowedTargets[current].includes(newStatus)) return { error: "invalid_status_transition" as const }
        if (newStatus === "Approved") {
          const eligibilityGuardRes = await client.query(
            `SELECT COUNT(*)::int AS c
             FROM senteloans_loan_eligibility_reviews
             WHERE loan_id = $1
               AND is_eligible = FALSE`,
            [id]
          )
          const pendingEligibilityCount = Number(eligibilityGuardRes.rows[0]?.c || 0)
          if (pendingEligibilityCount > 0) return { error: "eligibility_review_incomplete" as const }
        }
        if (newStatus === "Reviewed") {
          const canReviewLoan = await hasPermission(client, actor, "review_loan")
          if (!canReviewLoan) return { error: "missing_permission:review_loan" as const }
        }
        updates.status = newStatus
        if (newStatus === "Reviewed") {
          updates.reviewed_at = new Date().toISOString()
          updates.reviewed_by = actor.id
        }
        if (newStatus === "Approved") {
          if (!loan.approved_at) updates.approved_at = new Date().toISOString()
          updates.approved_by = actor.id
        }
        if (newStatus === "Fully Disbursed" || newStatus === "Partially Disbursed") {
          const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
          const normalizedLoanType = String(loan.loan_type || "normal").trim().toLowerCase()
          if (normalizedLoanType !== "normal") {
            return { error: "disbursement_not_supported_for_loan_type_yet" as const }
          }
          if (disbursement_type !== "complete" && disbursement_type !== "partial") {
            return { error: "disbursement_type_not_supported_yet" as const }
          }
          let processingFeePercentage = 0
          if (loan.loan_product_id) {
            const feeRes = await client.query(
              `SELECT processing_fee_percentage
               FROM senteloans_loan_products
               WHERE id = $1`,
              [loan.loan_product_id]
            )
            processingFeePercentage = Number(feeRes.rows[0]?.processing_fee_percentage || 0)
          }
          const settlementRes = await client.query(
            `SELECT settlement_amount
             FROM senteloans_loan_settlements
             WHERE new_loan_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [id]
          )
          const settlementAmount = Number(settlementRes.rows[0]?.settlement_amount || 0)
          const disbursementCalc = calculateCompleteDisbursementAmount({
            principal: Number(loan.principal_amount || 0),
            processingFeePercentage,
            settlementAmount,
            loanType: loan.loan_type,
          })
          completeDisbursementAmount = disbursementCalc.completeDisbursementAmount
          const currentStatus = String(loan.status || "")
          const defaultRemaining = Math.max(0, Number(completeDisbursementAmount || 0))
          const savedRemaining = Math.max(0, Number(loan.disbursement_balance || 0))
          const remainingBefore = currentStatus === "Partially Disbursed" ? savedRemaining : defaultRemaining
          if (remainingBefore <= 0) return { error: "no_remaining_disbursement_balance" as const }
          if (disbursement_amount === null || disbursement_amount <= 0) {
            return { error: "invalid_disbursement_amount" as const }
          }
          const roundedIncoming = round2(Number(disbursement_amount || 0))
          const roundedRemaining = round2(remainingBefore)

          if (disbursement_type === "partial") {
            if (newStatus !== "Partially Disbursed") {
              return { error: "invalid_disbursement_status_for_partial" as const }
            }
            if (roundedIncoming >= roundedRemaining) {
              return { error: "partial_amount_must_be_less_than_remaining_disbursable" as const }
            }
            const remainingAfter = round2(Math.max(roundedRemaining - roundedIncoming, 0))
            disbursementContext = {
              amount: roundedIncoming,
              balanceBefore: roundedRemaining,
              balanceAfter: remainingAfter,
              disbursementTypeLabel: "partial loan disburse",
              notes: disbursement_notes || "Partial loan disbursement",
            }
            updates.disbursement_balance = remainingAfter
          } else {
            if (newStatus !== "Fully Disbursed") {
              return { error: "invalid_disbursement_status_for_complete" as const }
            }
            if (roundedIncoming !== roundedRemaining) {
              return { error: "invalid_disbursement_amount" as const }
            }
            disbursementContext = {
              amount: roundedIncoming,
              balanceBefore: roundedRemaining,
              balanceAfter: 0,
              disbursementTypeLabel: "full loan disburse",
              notes: "Full loan disbursement",
            }
            updates.disbursement_balance = 0
          }
          updates.disbursement_date = disbursement_date
          if (newStatus === "Fully Disbursed") {
            const totalAmount = Number(loan.total_amount ?? 0)
            const principal = Number(loan.principal_amount ?? 0)
            const tenureMonths = Math.floor(Number(loan.tenure_months ?? 0))
            const rate = Number(loan.interest_rate ?? 0)
            let calcMethod: string = "reducing_balance"
            if (loan.loan_product_id) {
              const methodRes = await client.query(
                `SELECT interest_calculation_method FROM senteloans_loan_products WHERE id = $1`,
                [loan.loan_product_id]
              )
              calcMethod = String(methodRes.rows[0]?.interest_calculation_method || "reducing_balance")
            }
            const initialOutstanding = totalAmount > 0
              ? totalAmount
              : tenureMonths > 0 && principal > 0
                ? calculateLoanTerms(principal, rate, tenureMonths, calcMethod).totalAmount
                : principal
            updates.outstanding_balance = initialOutstanding
          }
        }
      }

      if (Object.keys(updates).length === 0 && !eligibilityUpdatesApplied) return { error: "no_updates" as const }

      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ")
        await client.query(`UPDATE senteloans_loans SET ${setClause} WHERE id = $1`, [id, ...Object.values(updates)])
      } else {
        await client.query(`UPDATE senteloans_loans SET updated_at = NOW() WHERE id = $1`, [id])
      }

      if (newStatus === "Fully Disbursed") {
        const loanDetailRes = await client.query(
          `SELECT l.principal_amount, l.interest_rate, l.tenure_months, l.disbursement_date, lp.interest_calculation_method
           FROM senteloans_loans l
           LEFT JOIN senteloans_loan_products lp ON lp.id = l.loan_product_id
           WHERE l.id = $1`,
          [id]
        )
        const loanDetail = loanDetailRes.rows[0]
        if (loanDetail && Number(loanDetail.tenure_months) > 0) {
          const principal = Number(loanDetail.principal_amount || 0)
          const annualRate = Number(loanDetail.interest_rate || 0)
          const tenureMonths = Math.floor(Number(loanDetail.tenure_months))
          const disbursementDateStr = toDateString(loanDetail.disbursement_date ?? new Date().toISOString().slice(0, 10))
          const schedule = buildRepaymentSchedule({
            principal,
            annualRate,
            tenureMonths,
            method: loanDetail.interest_calculation_method,
            startDate: disbursementDateStr,
          })
          const firstDueDateStr = schedule[0]?.dueDate ?? null
          for (const row of schedule) {
            await client.query(
              `INSERT INTO senteloans_loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_due, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
               ON CONFLICT (loan_id, installment_number) DO NOTHING`,
              [id, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount, row.totalAmount]
            )
          }
          if (firstDueDateStr) {
            await client.query(
              `UPDATE senteloans_loans SET next_payment_date = $1, updated_at = NOW() WHERE id = $2`,
              [firstDueDateStr, id]
            )
          } else {
            await client.query(
              `UPDATE senteloans_loans SET updated_at = NOW() WHERE id = $1`,
              [id]
            )
          }
        } else {
          await client.query(
            `UPDATE senteloans_loans SET updated_at = NOW() WHERE id = $1`,
            [id]
          )
        }
      } else if (newStatus === "Partially Disbursed") {
        await client.query(
          `UPDATE senteloans_loans SET updated_at = NOW() WHERE id = $1`,
          [id]
        )
      }

      if (disbursementContext) {
        const disburseTxNumber = `LD-${Date.now()}`
        const amount = Number(disbursementContext.amount || 0)
        const txRes = await client.query(
          `INSERT INTO senteloans_transactions (institution_id, branch_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, $3, NULL, $4, $5, 'Loan Disbursement', $6, $7, $8, $9, $10, $11, $12, $13, 'Completed')
           RETURNING id`,
          [
            actor.institution_id,
            loan.branch_id,
            loan.member_id,
            id,
            disburseTxNumber,
            amount,
            disbursement_mode,
            `Loan disbursement - ${id.slice(0, 8)}`,
            disburseTxNumber,
            Number(disbursementContext.balanceBefore || 0),
            Number(disbursementContext.balanceAfter || 0),
            actor.id,
            disbursement_date,
          ]
        )
        const transactionId = String(txRes.rows[0]?.id || "")
        if (!transactionId) return { error: "disbursement_transaction_create_failed" as const }

        await client.query(
          `INSERT INTO senteloans_loan_disbursements
            (institution_id, branch_id, loan_id, disbursement_type, transaction_id, amount, disbursement_date, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            actor.institution_id,
            loan.branch_id,
            id,
            disbursementContext.disbursementTypeLabel,
            transactionId,
            amount,
            disbursement_date,
            disbursementContext.notes,
            actor.id,
          ]
        )
      }

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, branch_id, user_id, table_name, operation, record_id, new_values) VALUES ($1, $2, $3, 'senteloans_loans', 'UPDATE', $4, $5)`,
        [actor.institution_id, loan.branch_id, actor.id, id, JSON.stringify(updates)]
      )

      if (newStatus) {
        const loanWithMemberRes = await client.query(`SELECT member_id, principal_amount FROM senteloans_loans WHERE id = $1`, [id])
        const loanWithMember = loanWithMemberRes.rows[0]
        if (loanWithMember?.member_id) {
          let tpl: { title: string; message: string; actionUrl: string } | null = null
          const notifType = newStatus === "Approved" ? "loan_approved" : newStatus === "Rejected" ? "loan_rejected" : newStatus === "Fully Disbursed" ? "loan_disbursed" : "loan_status_change"
          if (newStatus === "Approved") tpl = NotificationTemplates.loanApproved(id, Number(loanWithMember.principal_amount || 0))
          else if (newStatus === "Rejected") tpl = NotificationTemplates.loanRejected(id, Number(loanWithMember.principal_amount || 0))
          else if (newStatus === "Fully Disbursed") tpl = NotificationTemplates.loanDisbursed(id, Number(loanWithMember.principal_amount || 0))
          if (tpl) {
            await notificationService.create({
              institutionId: actor.institution_id,
              recipientType: "client",
              recipientId: loanWithMember.member_id,
              type: notifType as "loan_approved" | "loan_rejected" | "loan_disbursed" | "loan_status_change",
              title: tpl.title,
              message: tpl.message,
              actionUrl: tpl.actionUrl,
              metadata: { loan_id: id, amount: loanWithMember.principal_amount, status: newStatus },
            }).catch((e) => console.error("Failed to create loan status notification:", e))
          }
        }
      }
      return { ok: true }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "unknown_error")
      const status =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "cross_tenant_operation_forbidden" || errorCode === "cross_branch_operation_forbidden" ? 403 :
        errorCode === "not_found" || errorCode === "user_not_linked" ? (errorCode === "not_found" ? 404 : 403) : 400
      apiLog("warn", "loans.update.denied", { method: "PUT", apiPath, status, error: errorCode, authUserId: session.user.authUserId, loanId: id })
      return NextResponse.json({ error: errorCode }, { status })
    }
    apiLog("info", "loans.update.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId, loanId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
