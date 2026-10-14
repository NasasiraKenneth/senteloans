import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { notifyLoanStatusChanged } from "@/lib/notifications/loan-events"
import { enqueueLoanStatusEmails } from "@/lib/email/loan-emails"
import { auditLogger } from "@/lib/audit/audit-logger"
import { calculateCompleteDisbursementAmount } from "@/lib/loans/calculations"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  requireStaffSession,
  resolveActorContext,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { loanWriteDenialBody, loanWriteDenialStatus } from "@/lib/loans/write-denial"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.detail.invalid_request", { method: "GET", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "loans.detail.denied", { method: "GET", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, remaining_tenure_months, monthly_payment, total_amount, outstanding_balance, disbursement_balance, status, loan_type, purpose, collateral_description, application_date, approved_at, disbursement_date, maturity_date, next_payment_date, overdue_days, created_by, created_at, updated_at
         FROM loans WHERE id = $1`,
        [id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return null
      if (String(loan.institution_id) !== String(actor.institution_id)) return null
      if (!isSuperAdmin(actor) && String(loan.branch_id) !== String(actor.branch_id)) return null

      let member_name = ""
      let member_number = ""
      if (loan.member_id) {
        const mRes = await client.query(`SELECT id, full_name, member_number FROM members WHERE id = $1`, [loan.member_id])
        member_name = mRes.rows[0]?.full_name || ""
        member_number = mRes.rows[0]?.member_number || ""
      }

      let product_name = ""
      let processing_fee_percentage = 0
      if (loan.loan_product_id) {
        const pRes = await client.query(
          `SELECT id, product_name, processing_fee_percentage
           FROM loan_products
           WHERE id = $1`,
          [loan.loan_product_id]
        )
        product_name = pRes.rows[0]?.product_name || ""
        processing_fee_percentage = Number(pRes.rows[0]?.processing_fee_percentage || 0)
      }

      const guarsRes = await client.query(
        `SELECT id, guarantor_member_id, guaranteed_amount, status FROM loan_guarantors WHERE loan_id = $1`,
        [loan.id]
      )
      const guarsRows = guarsRes.rows
      let guarantors: Array<{ member_id: string; member_name: string; guaranteed_amount: number; status: string }> = []
      if (guarsRows.length > 0) {
        const gIds = [...new Set(guarsRows.map((g: { guarantor_member_id: string }) => g.guarantor_member_id))]
        const gMembersRes = await client.query(`SELECT id, full_name FROM members WHERE id = ANY($1::uuid[])`, [gIds])
        const gMap: Record<string, string> = Object.fromEntries(gMembersRes.rows.map((m: { id: string; full_name: string }) => [m.id, m.full_name]))
        guarantors = guarsRows.map((g: { guarantor_member_id: string; guaranteed_amount: number; status: string }) => ({
          member_id: g.guarantor_member_id,
          member_name: gMap[g.guarantor_member_id] || "",
          guaranteed_amount: Number(g.guaranteed_amount || 0),
          status: g.status,
        }))
      }

      const repRes = await client.query(
        `SELECT id, due_date, total_amount, amount_paid, status FROM loan_repayments WHERE loan_id = $1 ORDER BY due_date ASC`,
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
         FROM loan_settlements s
         LEFT JOIN loans l ON l.id = s.settled_loan_id
         LEFT JOIN third_party_agents c ON c.id = s.external_lender_id
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
         FROM loan_disbursements
         WHERE loan_id = $1
           AND NOT (
             disbursement_type = 'partial loan disburse'
             AND (
               notes = 'Partial disbursement to settle previous loan'
               OR notes = 'Partial disbursement to settle external lender'
             )
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
         FROM loan_eligibility_reviews
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
          remaining_tenure_months: loan.remaining_tenure_months,
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
      apiLog("warn", "loans.detail.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: sess.authUserId, loanId: id })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result) {
      apiLog("warn", "loans.detail.not_found", { method: "GET", apiPath, status: 404, authUserId: sess.authUserId, loanId: id })
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    apiLog("info", "loans.detail.success", { method: "GET", apiPath, status: 200, authUserId: sess.authUserId, loanId: id })
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

    if (session.user.type !== "staff") {
      apiLog("warn", "loans.update.denied", { method: "PUT", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const newStatus = typeof body.status === "string" ? body.status.trim() : undefined
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : undefined
    const collateral_description = typeof body.collateral_description === "string" ? body.collateral_description.trim() : undefined
    const eligibility_reviews = Array.isArray(body.eligibility_reviews)
      ? (body.eligibility_reviews as Array<{ id?: string; is_eligible?: boolean }>)
      : []

    const allowedTargets: Record<string, string[]> = {
      Applied: ["Under Review", "Rejected"],
      "Under Review": ["Reviewed", "Rejected"],
      Reviewed: ["Approved", "Rejected"],
      Approved: [],
      Rejected: [],
      "Fully Disbursed": [],
      "Partially Disbursed": [],
      Active: [],
      Closed: [],
      Defaulted: [],
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      if (actor.branch_id) {
        const branchCheck = await assertBranchActive(client, actor.branch_id)
        if (!branchCheck.ok) {
          return {
            error: branchCheck.error,
            branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
          }
        }
      }

      const permissionByStatus: Record<string, string> = {
        "Under Review": "review_loan",
        Reviewed: "review_loan",
        Approved: "approve_loan",
        Rejected: "reject_loan",
      }
      const requiredPermission = newStatus ? permissionByStatus[newStatus] || "review_loan" : "review_loan"
      const allowed = await hasPermission(client, actor, requiredPermission)
      if (!allowed) return { error: `missing_permission:${requiredPermission}` as const }
      if (newStatus === "Approved") {
        const canApprove = await hasPermission(client, actor, "approve_loan")
        if (!canApprove) return { error: "missing_permission:approve_loan" as const }
      }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, status, approved_at, loan_product_id
         FROM loans
         WHERE id = $1`,
        [id],
      )
      const actorRes = await client.query(`SELECT id, institution_id, branch_id FROM users WHERE id = $1`, [actor.id])
      const loan = loanRes.rows[0]
      const actorRow = actorRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (!actorRow) return { error: "user_not_linked" as const }
      if (loan.institution_id !== actorRow.institution_id) return { error: "cross_tenant_operation_forbidden" as const }
      if (!isSuperAdmin(actor) && String(loan.branch_id) !== String(actorRow.branch_id)) return { error: "cross_branch_operation_forbidden" as const }
      const loanBranchId = String(loan.branch_id || "")
      if (!loanBranchId) return { error: "loan_branch_missing" as const }

      let txCommitted = false
      await client.query("BEGIN")
      try {
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
            `UPDATE loan_eligibility_reviews
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
              `INSERT INTO audit_logs
                (institution_id, branch_id, user_id, table_name, category, operation, record_id, new_values)
               VALUES ($1, $2, $3, 'loan_eligibility_reviews', 'loans', 'UPDATE', $4, $5)`,
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
        if (typeof newStatus !== "undefined") {
          const current = String(loan.status)
          if (!Object.prototype.hasOwnProperty.call(allowedTargets, current)) return { error: "invalid_current_status" as const }
          if (!allowedTargets[current].includes(newStatus)) return { error: "invalid_status_transition" as const }
          if (newStatus === "Approved") {
            const eligibilityGuardRes = await client.query(
              `SELECT COUNT(*)::int AS c
               FROM loan_eligibility_reviews
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
        }

        if (Object.keys(updates).length === 0 && !eligibilityUpdatesApplied) return { error: "no_updates" as const }

        if (Object.keys(updates).length > 0) {
          const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ")
          await client.query(`UPDATE loans SET ${setClause} WHERE id = $1`, [id, ...Object.values(updates)])
        } else {
          await client.query(`UPDATE loans SET updated_at = NOW() WHERE id = $1`, [id])
        }

        const oldValues: Record<string, unknown> = {}
        Object.keys(updates).forEach((k) => {
          oldValues[k] = (loan as Record<string, unknown>)[k]
        })
        await auditLogger.logUpdate(
          "loans",
          id,
          oldValues,
          updates,
          actor.institution_id,
          actor.id,
          { branch_id: loanBranchId },
          client
        )

        if (newStatus) {
          let postCommit: {
            actorId: string
            institutionId: string
            branchId: string
            institutionName: string
            currency: string
            newStatus: string
            member: { id: string; full_name: string; member_number: string; email: string }
            loan: {
              id: string
              application_id: string
              principal_amount: number
              loan_type: string
              product_name: string | null
            }
          } | null = null

          const ctxRes = await client.query(
            `SELECT
               l.application_id,
               l.principal_amount,
               l.loan_type,
               COALESCE(lp.product_name, '') AS product_name,
               m.id AS member_id,
               COALESCE(m.full_name, '') AS full_name,
               COALESCE(m.member_number, '') AS member_number,
               COALESCE(m.email, '') AS email
             FROM loans l
             LEFT JOIN members m ON m.id = l.member_id
             LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
             WHERE l.id = $1`,
            [id],
          )
          const ctxRow = ctxRes.rows[0] as Record<string, unknown> | undefined
          if (ctxRow?.member_id) {
            const cfgRes = await client.query<{ currency: string }>(
              `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
              [loanBranchId],
            )
            const instRes = await client.query<{ name: string }>(
              `SELECT name FROM institutions WHERE id = $1`,
              [actor.institution_id],
            )
            postCommit = {
              actorId: actor.id,
              institutionId: actor.institution_id,
              branchId: loanBranchId,
              institutionName: instRes.rows[0]?.name || "",
              currency: (cfgRes.rows[0]?.currency as string) || "UGX",
              newStatus,
              member: {
                id: String(ctxRow.member_id),
                full_name: String(ctxRow.full_name || ""),
                member_number: String(ctxRow.member_number || ""),
                email: String(ctxRow.email || ""),
              },
              loan: {
                id,
                application_id: String(ctxRow.application_id || ""),
                principal_amount: Number(ctxRow.principal_amount || 0),
                loan_type: String(ctxRow.loan_type || "normal"),
                product_name: ctxRow.product_name ? String(ctxRow.product_name) : null,
              },
            }
          }
          await client.query("COMMIT")
          txCommitted = true
          return { ok: true, postCommit }
        }
        await client.query("COMMIT")
        txCommitted = true
        return { ok: true }
      } finally {
        if (!txCommitted) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "unknown_error")
      const status = loanWriteDenialStatus(errorCode)
      apiLog("warn", "loans.update.denied", { method: "PUT", apiPath, status, error: errorCode, authUserId: session.user.authUserId, loanId: id })
      return NextResponse.json(loanWriteDenialBody(result as { error: string; message?: string; staffStatus?: string; branchStatus?: string }), { status })
    }
    apiLog("info", "loans.update.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId, loanId: id })

    const ctx = result && "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyLoanStatusChanged({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            loan: ctx.loan,
            newStatus: ctx.newStatus,
            currency: ctx.currency,
          }),
        )
        apiLog(notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "loans.update.notifications_dispatched" : "loans.update.notifications_partial",
          {
            method: "PUT",
            apiPath,
            status: 200,
            loanId: id,
            newStatus: ctx.newStatus,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "loans.update.notifications_failed", {
          method: "PUT",
          apiPath,
          status: 200,
          loanId: id,
          newStatus: ctx.newStatus,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailRes = await enqueueLoanStatusEmails({
          actorId: ctx.actorId,
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          member: ctx.member,
          loan: ctx.loan,
          newStatus: ctx.newStatus,
          context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "loans.update.email_enqueue_partial", {
            method: "PUT",
            apiPath,
            status: 200,
            loanId: id,
            newStatus: ctx.newStatus,
            errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "loans.update.email_enqueue_failed", {
          method: "PUT",
          apiPath,
          status: 200,
          loanId: id,
          newStatus: ctx.newStatus,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
