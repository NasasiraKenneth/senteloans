import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { assertBranchActive, type BranchStatus } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { hasPermission, isSuperAdmin, resolveActorContext, SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"
import { auditLogger } from "@/lib/audit/audit-logger"
import { PAYMENT_MODES } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { createTransaction } from "@/lib/transactions/create-transaction"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_DISBURSE_STATUSES = new Set(["Approved", "Partially Disbursed"])

function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function formatApprovedAt(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric" })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const disbursement_type_raw = String(
      body.disbursement_type ?? body.disbursementType ?? "",
    ).trim() as "complete" | "partial" | ""
    const amount = Number(body.amount)
    const balanceRaw = body.balance
    const balance =
      balanceRaw === undefined || balanceRaw === null || balanceRaw === ""
        ? undefined
        : Number(balanceRaw)
    const disbursement_mode = String(body.disbursement_mode ?? body.disbursementMode ?? "").trim()
    const disbursement_date = String(body.disbursement_date ?? body.disbursementDate ?? "")
      .trim()
      .slice(0, 10)
    const reference_number = String(body.reference_number ?? body.referenceNumber ?? "").trim()
    const bank_account_id = String(body.bank_account_id ?? body.bankAccountId ?? "").trim()

    if (disbursement_type_raw !== "complete" && disbursement_type_raw !== "partial") {
      return NextResponse.json({ error: "invalid_disbursement_type" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!(PAYMENT_MODES as readonly string[]).includes(disbursement_mode)) {
      return NextResponse.json({ error: "invalid_disbursement_mode" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(disbursement_date)) {
      return NextResponse.json({ error: "invalid_disbursement_date" }, { status: 400 })
    }
    const paymentModeError = validatePaymentModeInput({
      mode: disbursement_mode,
      referenceNumber: reference_number,
      bankAccountId: bank_account_id,
    })
    if (paymentModeError) {
      return NextResponse.json({ error: paymentModeError }, { status: 400 })
    }
    if (disbursement_type_raw === "partial") {
      if (!Number.isFinite(balance as number)) {
        return NextResponse.json({ error: "invalid_balance" }, { status: 400 })
      }
      if ((balance as number) < 0) {
        return NextResponse.json({ error: "invalid_balance" }, { status: 400 })
      }
    } else if (balance !== undefined && Number.isFinite(balance)) {
      return NextResponse.json({ error: "balance_not_allowed_for_complete" }, { status: 400 })
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
      const allowed = await hasPermission(client, actor, "disburse_sacco_loan")
      if (!allowed) return { error: "missing_permission:disburse_sacco_loan" as const }

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
      const qparams: unknown[] = [loanId, actor.institution_id]
      if (!isSA) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const loanRes = await client.query<{
        status: string
        disbursement_balance: string | number
        principal_amount: string | number
        total_amount: string | number | null
        third_party_agent_id: string
        branch_id: string
        loan_product: string | null
        approved_at: Date | string | null
      }>(
        `SELECT l.status, l.disbursement_balance, l.principal_amount, l.total_amount,
                l.third_party_agent_id, l.branch_id, l.loan_product, l.approved_at
         FROM institution_loans l
         WHERE ${where}
         LIMIT 1`,
        qparams,
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }

      if (!VALID_DISBURSE_STATUSES.has(String(loan.status || ""))) {
        return { error: "invalid_loan_status_for_disbursement" as const }
      }
      if (loan.approved_at == null) {
        return { error: "loan_not_approved" as const }
      }

      const remainingBefore = roundMoney(Number(loan.disbursement_balance ?? 0))
      const principal = roundMoney(Number(loan.principal_amount ?? 0))
      const totalAmt = roundMoney(Number(loan.total_amount ?? NaN))
      /** Schema uses total_amount (loan total incl. interest when set). Fallback to principal if total is unset. */
      const outstandingSeed =
        Number.isFinite(totalAmt) && totalAmt > 0 ? totalAmt : principal > 0 ? principal : 0

      const disbursementAmount = roundMoney(amount)
      const disbursableCap =
        remainingBefore > 0
          ? remainingBefore
          : String(loan.status || "") === "Approved" && principal > 0
            ? principal
            : 0

      const txBalanceBefore =
        remainingBefore > 0 ? remainingBefore : disbursableCap > 0 ? disbursableCap : 0

      let newDisbursementBalance: number
      let nextStatus: "Fully Disbursed" | "Partially Disbursed"

      if (disbursement_type_raw === "complete") {
        if (disbursableCap <= 0) {
          return { error: "no_remaining_disbursement_balance" as const }
        }
        if (disbursementAmount > disbursableCap) {
          return { error: "invalid_amount" as const }
        }
        newDisbursementBalance = 0
        nextStatus = "Fully Disbursed"
      } else {
        if (remainingBefore <= 0) {
          return { error: "no_remaining_disbursement_balance" as const }
        }
        const bal = roundMoney(balance as number)
        if (disbursementAmount > remainingBefore) {
          return { error: "invalid_amount" as const }
        }
        newDisbursementBalance = bal
        nextStatus = "Partially Disbursed"
      }

      const productLabel = (loan.loan_product && String(loan.loan_product).trim()) || "Loan"
      const approvedLabel = formatApprovedAt(
        loan.approved_at != null ? String(loan.approved_at) : null,
      )
      const description = `${productLabel} sacco loan disbursement ${approvedLabel || "approved"}`
      const loanBranchId = String(loan.branch_id || "")

      const updateWhere = isSA
        ? "id = $6 AND institution_id = $7"
        : "id = $6 AND institution_id = $7 AND branch_id = $8"
      const updateParams = isSA
        ? [
            newDisbursementBalance,
            disbursement_date,
            nextStatus,
            actor.id,
            outstandingSeed,
            loanId,
            actor.institution_id,
          ]
        : [
            newDisbursementBalance,
            disbursement_date,
            nextStatus,
            actor.id,
            outstandingSeed,
            loanId,
            actor.institution_id,
            loan.branch_id,
          ]

      let txCommitted = false
      await client.query("BEGIN")
      try {
        const upd = await client.query(
          `UPDATE institution_loans
           SET disbursement_balance = $1,
               disbursement_date = $2::date,
               status = $3::loan_status_type,
               modified_by = $4,
               outstanding_balance = CASE
                 WHEN (outstanding_balance IS NULL OR outstanding_balance <= 0)
                   AND $5::numeric IS NOT NULL
                   AND $5::numeric > 0
                 THEN $5::numeric
                 ELSE outstanding_balance
               END,
               updated_at = NOW()
           WHERE ${updateWhere}`,
          updateParams,
        )
        if (upd.rowCount === 0) {
          return { error: "update_failed" as const }
        }
        await auditLogger.logUpdate(
          "institution_loans",
          loanId,
          {
            status: loan.status,
            disbursement_balance: remainingBefore,
            disbursement_date: null,
            outstanding_balance: Number(loan.disbursement_balance ?? 0),
          },
          {
            status: nextStatus,
            disbursement_balance: newDisbursementBalance,
            disbursement_date,
            outstanding_balance: outstandingSeed,
          },
          actor.institution_id,
          actor.id,
          { branch_id: loanBranchId },
          client
        )

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            thirdPartyAgentId: loan.third_party_agent_id,
            saccoLoanId: loanId,
            bankAccountId: bank_account_id || null,
            type: "Loan Disbursement",
            amount: disbursementAmount,
            mode: disbursement_mode,
            description,
            referenceNumber: reference_number || null,
            balanceBefore: txBalanceBefore,
            balanceAfter: newDisbursementBalance,
            processedBy: actor.id,
            transactionDate: disbursement_date,
            prefix: "TXN",
          })

          await settlePaymentByMode(client, {
            institutionId: actor.institution_id,
            branchId: loanBranchId,
            amount: disbursementAmount,
            mode: disbursement_mode,
            flow: "inflow",
            actor,
            bankAccountId: bank_account_id || null,
            referenceNumber: reference_number,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            if (e.code === "insufficient_bank_balance") {
              return { error: "bank_account_insufficient_funds" as const }
            }
            return { error: e.code as typeof e.code }
          }
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "disbursement_transaction_create_failed" as const }
          }
          throw e
        }

        await client.query("COMMIT")
        txCommitted = true

        return {
          ok: true as const,
          status: nextStatus,
          disbursement_balance: newDisbursementBalance,
          transaction_number: tx.transactionNumber,
        }
      } finally {
        if (!txCommitted) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "missing_permission:disburse_sacco_loan" ||
        err === "user_not_linked" ||
        err === "staff_inactive" ||
        err === "branch_inactive" ||
        err === "branch_not_found" ||
        err === SUPER_ADMIN_WRITE_BLOCKED
          ? 403
          : err === "staff_not_found" || err === "not_found"
            ? 404
            : err === "actor_branch_missing"
              ? 400
              : 400
      apiLog("warn", "sacco_loans.disburse.denied", { method: "POST", apiPath, status: statusCode, error: err })
      const payload: Record<string, unknown> = { error: err }
      if ("staffStatus" in result && result.staffStatus) payload.staff_status = result.staffStatus
      if ("branchStatus" in result && result.branchStatus) payload.branch_status = result.branchStatus as BranchStatus
      return NextResponse.json(payload, { status: statusCode })
    }

    apiLog("info", "sacco_loans.disburse.success", { method: "POST", apiPath, status: 200, loanId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.disburse.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
