import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { calculateCompleteDisbursementAmount } from "@/lib/loans/calculations"

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const canDisburse = await hasPermission(client, actor, "disburse_loan")
      if (!canDisburse) return { error: "missing_permission:disburse_loan" as const }

      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, loan_product_id, principal_amount, status, loan_type
         FROM senteloans_loans
         WHERE id = $1
         LIMIT 1`,
        [id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (String(loan.institution_id) !== String(actor.institution_id)) return { error: "cross_tenant_operation_forbidden" as const }
      if (!isSuperAdmin && String(loan.branch_id) !== String(actor.branch_id)) return { error: "cross_branch_operation_forbidden" as const }
      if (String(loan.status) !== "Approved") return { error: "invalid_status_for_settle_previous" as const }

      const loanType = String(loan.loan_type || "normal").trim().toLowerCase()
      if (loanType !== "top up" && loanType !== "buy off") return { error: "invalid_loan_type_for_settle_previous" as const }

      const settlementRes = await client.query(
        `SELECT id, settled_loan_id, settlement_amount, settlement_status, disbursement_id
         FROM senteloans_loan_settlements
         WHERE new_loan_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id]
      )
      const settlement = settlementRes.rows[0]
      if (!settlement) return { error: "settlement_not_found" as const }
      if (["complete", "completed"].includes(String(settlement.settlement_status || "").toLowerCase()) || settlement.disbursement_id) {
        return { error: "settlement_already_completed" as const }
      }
      const settlementAmount = Number(settlement.settlement_amount || 0)
      if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) return { error: "invalid_settlement_amount" as const }

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
      const disbursementCalc = calculateCompleteDisbursementAmount({
        principal: Number(loan.principal_amount || 0),
        processingFeePercentage,
        settlementAmount,
        loanType: loan.loan_type,
      })
      const remainingMemberDisbursement = Math.max(0, Number(disbursementCalc.completeDisbursementAmount || 0))
      const nowDate = new Date().toISOString().slice(0, 10)
      const notes = "Partial disbursement to settle previous loan"

      const txNumber = `LD-${Date.now()}`
      const txRes = await client.query(
        `INSERT INTO senteloans_transactions
          (institution_id, branch_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
         VALUES
          ($1, $2, $3, NULL, $4, $5, 'Loan Disbursement', $6, 'Bank Transfer', $7, $8, $9, $10, $11, $12, 'Completed')
         RETURNING id`,
        [
          actor.institution_id,
          loan.branch_id,
          loan.member_id,
          id,
          txNumber,
          settlementAmount,
          notes,
          txNumber,
          settlementAmount,
          0,
          actor.id,
          nowDate,
        ]
      )
      const transactionId = String(txRes.rows[0]?.id || "")
      if (!transactionId) return { error: "settlement_transaction_create_failed" as const }

      const disbRes = await client.query(
        `INSERT INTO senteloans_loan_disbursements
          (institution_id, branch_id, loan_id, disbursement_type, transaction_id, amount, disbursement_date, notes, created_by)
         VALUES
          ($1, $2, $3, 'partial loan disburse', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          actor.institution_id,
          loan.branch_id,
          id,
          transactionId,
          settlementAmount,
          nowDate,
          notes,
          actor.id,
        ]
      )
      const disbursementId = String(disbRes.rows[0]?.id || "")
      if (!disbursementId) return { error: "settlement_disbursement_create_failed" as const }

      await client.query(
        `UPDATE senteloans_loan_settlements
         SET disbursement_id = $1, settlement_status = 'Completed'
         WHERE id = $2`,
        [disbursementId, settlement.id]
      )

      await client.query(
        `UPDATE senteloans_loans
         SET status = 'Partially Disbursed',
             disbursement_date = $1,
             disbursement_balance = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [nowDate, remainingMemberDisbursement, id]
      )

      await client.query(
        `INSERT INTO senteloans_audit_logs
          (institution_id, branch_id, user_id, table_name, operation, record_id, new_values)
         VALUES
          ($1, $2, $3, 'senteloans_loan_settlements', 'UPDATE', $4, $5)`,
        [
          actor.institution_id,
          loan.branch_id,
          actor.id,
          settlement.id,
          JSON.stringify({
            settlement_status: "Completed",
            disbursement_id: disbursementId,
            notes,
          }),
        ]
      )

      return {
        ok: true as const,
        loanType,
        previousLoanId: loanType === "top up" ? String(settlement.settled_loan_id || "") : "",
        settlementAmount,
      }
    })

    if ("error" in result) {
      const errorCode = typeof result.error === "string" ? result.error : "unknown_error"
      const status =
        errorCode === "not_found" || errorCode === "settlement_not_found" ? 404 :
        errorCode.startsWith("missing_permission:") ||
        errorCode === "cross_tenant_operation_forbidden" ||
        errorCode === "cross_branch_operation_forbidden" ||
        errorCode === "actor_branch_missing" ||
        errorCode === "user_not_linked" ? 403 :
        400
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status, error: errorCode, authUserId: session.user.authUserId, loanId: id })
      return NextResponse.json({ error: errorCode }, { status })
    }

    if (result.loanType === "top up" && result.previousLoanId) {
      const nowDate = new Date().toISOString().slice(0, 10)
      const origin = new URL(req.url).origin
      const cookie = req.headers.get("cookie") || ""
      const repayRes = await fetch(`${origin}/api/institution/loans/${result.previousLoanId}/record-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({
          amount: Number(result.settlementAmount || 0),
          payment_date: nowDate,
          mode: "Cash",
        }),
      })
      if (!repayRes.ok) {
        const repayBody = await repayRes.json().catch(() => ({}))
        const repayError = String(repayBody?.error || "failed_to_record_previous_loan_payment")
        apiLog("error", "loans.settle_previous.error", {
          method: "POST",
          apiPath,
          status: 500,
          error: `record_payment_failed:${repayError}`,
          authUserId: session.user.authUserId,
          loanId: result.previousLoanId,
        })
        return NextResponse.json({ error: `record_payment_failed:${repayError}` }, { status: 500 })
      }
    }

    apiLog("info", "loans.settle_previous.success", { method: "POST", apiPath, status: 201, authUserId: session.user.authUserId, loanId: id })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.settle_previous.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
