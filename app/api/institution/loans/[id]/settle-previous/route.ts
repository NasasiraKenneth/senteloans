import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { calculateCompleteDisbursementAmount } from "@/lib/loans/calculations"
import { applyLoanPaymentInTransaction } from "@/lib/loans/apply-loan-payment-in-transaction"
import { auditLogger } from "@/lib/audit/audit-logger"
import { createTransaction } from "@/lib/transactions/create-transaction"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { PAYMENT_MODES } from "@/lib/finances/payment-mode"
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

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status: 400, error: "missing_id" })
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const mode = PAYMENT_MODES.includes(body.mode as (typeof PAYMENT_MODES)[number])
      ? (body.mode as string)
      : "Cash"
    const referenceNumberInput =
      typeof body.reference_number === "string"
        ? body.reference_number.trim()
        : typeof body.referenceNumber === "string"
          ? body.referenceNumber.trim()
          : ""
    const bankAccountIdInput = typeof body.bank_account_id === "string" ? body.bank_account_id.trim() : ""
    const paymentDate =
      typeof body.payment_date === "string" && body.payment_date.trim()
        ? body.payment_date.trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

    const modeValidation = validatePaymentModeInput({
      mode,
      referenceNumber: referenceNumberInput,
      bankAccountId: bankAccountIdInput,
    })
    if (modeValidation) {
      return NextResponse.json(loanWriteDenialBody({ error: modeValidation }), { status: 400 })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId, { activeOnly: false })
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

      const canDisburse = await hasPermission(client, actor, "disburse_loan")
      if (!canDisburse) return { error: "missing_permission:disburse_loan" as const }

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

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, application_id, loan_product_id, principal_amount, status, loan_type
         FROM loans
         WHERE id = $1
         LIMIT 1`,
        [id],
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (String(loan.institution_id) !== String(actor.institution_id)) return { error: "cross_tenant_operation_forbidden" as const }
      if (!isSuperAdmin(actor) && String(loan.branch_id) !== String(actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }
      if (String(loan.status) !== "Approved") return { error: "invalid_status_for_settle_previous" as const }

      const loanBranchId = String(loan.branch_id || "")
      if (!loanBranchId) return { error: "loan_branch_missing" as const }

      const loanType = String(loan.loan_type || "normal").trim().toLowerCase()
      if (loanType !== "top up" && loanType !== "buy off") return { error: "invalid_loan_type_for_settle_previous" as const }
      const isTopUp = loanType === "top up"
      const isBuyOff = loanType === "buy off"

      const settlementRes = await client.query(
        `SELECT id, settled_loan_id, external_lender_id, settlement_amount, settlement_status, disbursement_id
         FROM loan_settlements
         WHERE new_loan_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id],
      )
      const settlement = settlementRes.rows[0]
      if (!settlement) return { error: "settlement_not_found" as const }
      if (["complete", "completed"].includes(String(settlement.settlement_status || "").toLowerCase()) || settlement.disbursement_id) {
        return { error: "settlement_already_completed" as const }
      }

      const settlementAmount = round2(Number(settlement.settlement_amount || 0))
      if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) return { error: "invalid_settlement_amount" as const }

      type PreviousLoanRow = {
        id: string
        application_id: string | null
        outstanding_balance: string | number
        status: string
        institution_id: string
        branch_id: string
        member_id: string | null
      }

      let effectiveSettlementAmount = settlementAmount
      let previousLoan: PreviousLoanRow | null = null

      if (isTopUp) {
        const previousLoanId = String(settlement.settled_loan_id || "").trim()
        if (!previousLoanId) return { error: "previous_loan_not_found" as const }

        const prevRes = await client.query(
          `SELECT id, application_id, outstanding_balance, status, institution_id, branch_id, member_id
           FROM loans
           WHERE id = $1`,
          [previousLoanId],
        )
        previousLoan = (prevRes.rows[0] as PreviousLoanRow | undefined) ?? null
        if (!previousLoan) return { error: "previous_loan_not_found" as const }
        if (String(previousLoan.institution_id) !== String(actor.institution_id)) {
          return { error: "cross_tenant_operation_forbidden" as const }
        }
        if (!isSuperAdmin(actor) && String(previousLoan.branch_id) !== String(loan.branch_id)) {
          return { error: "cross_branch_operation_forbidden" as const }
        }

        const prevOutstanding = round2(Number(previousLoan.outstanding_balance || 0))
        if (prevOutstanding <= 0) return { error: "previous_loan_already_settled" as const }
        if (prevOutstanding > settlementAmount) {
          return { error: "previous_loan_outstanding_exceeds_settlement" as const }
        }

        effectiveSettlementAmount = prevOutstanding
      }

      let processingFeePercentage = 0
      if (loan.loan_product_id) {
        const feeRes = await client.query(
          `SELECT processing_fee_percentage
           FROM loan_products
           WHERE id = $1`,
          [loan.loan_product_id],
        )
        processingFeePercentage = Number(feeRes.rows[0]?.processing_fee_percentage || 0)
      }

      const disbursementCalc = calculateCompleteDisbursementAmount({
        principal: Number(loan.principal_amount || 0),
        processingFeePercentage,
        settlementAmount: effectiveSettlementAmount,
        loanType: loan.loan_type,
      })
      const remainingMemberDisbursement = round2(Math.max(0, Number(disbursementCalc.completeDisbursementAmount || 0)))
      const balanceBefore = round2(remainingMemberDisbursement + effectiveSettlementAmount)
      const balanceAfter = remainingMemberDisbursement
      const notes =
        loanType === "buy off"
          ? "Partial disbursement to settle external lender"
          : "Partial disbursement to settle previous loan"
      const applicationId = String(loan.application_id || "").trim() || id.slice(0, 8)
      const auditMeta = { branch_id: loanBranchId }

      let externalLenderName: string | null = null
      if (isBuyOff) {
        const externalLenderId = String(settlement.external_lender_id || "").trim()
        if (!externalLenderId) return { error: "external_lender_not_found" as const }
        const extRes = await client.query(
          `SELECT id, name FROM third_party_agents WHERE id = $1 AND institution_id = $2 AND branch_id = $3`,
          [externalLenderId, actor.institution_id, loan.branch_id],
        )
        const externalLender = extRes.rows[0] as { id: string; name?: string } | undefined
        if (!externalLender) return { error: "external_lender_not_found" as const }
        externalLenderName = String(externalLender.name || "").trim() || null
      }

      let txCommitted = false
      await client.query("BEGIN")
      try {
        const settlementDescription = isBuyOff
          ? `Buy-off settlement - ${applicationId}${externalLenderName ? ` (${externalLenderName})` : ""}`
          : `Top-up settlement disbursement - ${applicationId}`

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: loan.branch_id,
            memberId: loan.member_id,
            loanId: id,
            bankAccountId: bankAccountIdInput || null,
            type: "Loan Disbursement",
            amount: effectiveSettlementAmount,
            mode,
            description: settlementDescription,
            referenceNumber: referenceNumberInput || null,
            balanceBefore,
            balanceAfter,
            processedBy: actor.id,
            transactionDate: paymentDate,
            prefix: "TXN",
          })

          if (isBuyOff) {
            await settlePaymentByMode(client, {
              institutionId: actor.institution_id,
              branchId: loanBranchId,
              amount: effectiveSettlementAmount,
              mode,
              flow: "outflow",
              actor,
              bankAccountId: bankAccountIdInput || null,
              referenceNumber: referenceNumberInput,
            })
          }
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            return { error: e.code as typeof e.code }
          }
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "settlement_transaction_create_failed" as const }
          }
          throw e
        }

        const transactionId = tx.id

        const disbRes = await client.query(
          `INSERT INTO loan_disbursements
            (institution_id, branch_id, loan_id, disbursement_type, transaction_id, amount, disbursement_date, notes, created_by)
           VALUES
            ($1, $2, $3, 'partial loan disburse', $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            actor.institution_id,
            loan.branch_id,
            id,
            transactionId,
            effectiveSettlementAmount,
            paymentDate,
            notes,
            actor.id,
          ],
        )
        const disbursementId = String(disbRes.rows[0]?.id || "")
        if (!disbursementId) return { error: "settlement_disbursement_create_failed" as const }

        await auditLogger.logInsert(
          "loan_disbursements",
          disbursementId,
          {
            loan_id: id,
            disbursement_type: "partial loan disburse",
            transaction_id: transactionId,
            amount: effectiveSettlementAmount,
            disbursement_date: paymentDate,
            notes,
          },
          actor.institution_id,
          actor.id,
          auditMeta,
          client,
        )

        await client.query(
          `UPDATE loan_settlements
           SET disbursement_id = $1, settlement_status = 'Completed'
           WHERE id = $2`,
          [disbursementId, settlement.id],
        )

        await client.query(
          `UPDATE loans
           SET status = 'Partially Disbursed',
               disbursement_date = $1,
               disbursement_balance = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [paymentDate, remainingMemberDisbursement, id],
        )
        await auditLogger.logUpdate(
          "loans",
          id,
          { status: "Approved" },
          {
            status: "Partially Disbursed",
            disbursement_date: paymentDate,
            disbursement_balance: remainingMemberDisbursement,
          },
          actor.institution_id,
          actor.id,
          auditMeta,
          client,
        )

        await client.query(
          `INSERT INTO audit_logs
            (institution_id, branch_id, user_id, table_name, category, operation, record_id, new_values)
           VALUES
            ($1, $2, $3, 'loan_settlements', 'loans', 'UPDATE', $4, $5)`,
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
          ],
        )

        let previousLoanPayment: { transactionId: string } | null = null
        if (isTopUp && previousLoan) {
          const previousLoanId = String(previousLoan.id)
          const prevApplicationId =
            String(previousLoan.application_id || "").trim() || previousLoanId.slice(0, 8)
          const paymentResult = await applyLoanPaymentInTransaction(client, {
            loanId: previousLoanId,
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            memberId: previousLoan.member_id,
            applicationId: prevApplicationId,
            amount: effectiveSettlementAmount,
            paymentDate,
            mode,
            actorId: actor.id,
            referenceNumber: referenceNumberInput,
            bankAccountId: bankAccountIdInput,
            description: `Top-up settlement - ${prevApplicationId}`,
            auditMeta,
            skipFinanceSettlement: true,
            forceFullClose: true,
          })

          if ("error" in paymentResult) {
            return { error: paymentResult.error as typeof paymentResult.error }
          }
          previousLoanPayment = { transactionId: paymentResult.transactionId }
        }

        await client.query("COMMIT")
        txCommitted = true

        return {
          ok: true as const,
          loanType,
          settlementAmount: effectiveSettlementAmount,
          recordedSettlementAmount: settlementAmount,
          remainingMemberDisbursement,
          disbursementId,
          transactionId,
          previousLoanPayment,
        }
      } catch (e) {
        if (!txCommitted) {
          await client.query("ROLLBACK")
        }
        throw e
      }
    })

    if ("error" in result) {
      const errorCode = typeof result.error === "string" ? result.error : "unknown_error"
      const status =
        errorCode === "settlement_not_found" || errorCode === "previous_loan_not_found"
          ? 404
          : loanWriteDenialStatus(errorCode)
      apiLog("warn", "loans.settle_previous.denied", { method: "POST", apiPath, status, error: errorCode, authUserId: sess.authUserId, loanId: id })
      return NextResponse.json(loanWriteDenialBody(result as { error: string; message?: string; staffStatus?: string; branchStatus?: string }), { status })
    }

    apiLog("info", "loans.settle_previous.success", { method: "POST", apiPath, status: 201, authUserId: sess.authUserId, loanId: id })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loans.settle_previous.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
