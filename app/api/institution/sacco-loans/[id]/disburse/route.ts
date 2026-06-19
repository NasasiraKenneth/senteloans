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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_DISBURSE_STATUSES = new Set(["Approved", "Partially Disbursed"])

const PAYMENT_MODES = new Set(["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"])

function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function moneyEqual(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005
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

    if (disbursement_type_raw !== "complete" && disbursement_type_raw !== "partial") {
      return NextResponse.json({ error: "invalid_disbursement_type" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!PAYMENT_MODES.has(disbursement_mode)) {
      return NextResponse.json({ error: "invalid_disbursement_mode" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(disbursement_date)) {
      return NextResponse.json({ error: "invalid_disbursement_date" }, { status: 400 })
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
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "disburse_sacco_loan")
      if (!allowed) return { error: "missing_permission:disburse_sacco_loan" as const }

      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [loanId, actor.institution_id]
      if (!isSuperAdmin) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const loanRes = await client.query<{
        status: string
        disbursement_balance: string | number
        principal_amount: string | number
        total_amount: string | number | null
        client_id: string
        branch_id: string
        loan_product: string | null
        approved_at: Date | string | null
      }>(
        `SELECT l.status, l.disbursement_balance, l.principal_amount, l.total_amount,
                l.client_id, l.branch_id, l.loan_product, l.approved_at
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

      if (disbursement_type_raw === "partial" && remainingBefore <= 0) {
        return { error: "no_remaining_disbursement_balance" as const }
      }

      const completeTarget =
        remainingBefore > 0
          ? remainingBefore
          : String(loan.status || "") === "Approved" && principal > 0
            ? principal
            : 0

      const txBalanceBefore =
        remainingBefore > 0 ? remainingBefore : completeTarget > 0 ? completeTarget : 0

      let newDisbursementBalance: number
      let nextStatus: "Fully Disbursed" | "Partially Disbursed"

      if (disbursement_type_raw === "complete") {
        if (completeTarget <= 0) {
          return { error: "no_remaining_disbursement_balance" as const }
        }
        if (!moneyEqual(amount, completeTarget)) {
          return { error: "amount_must_equal_disbursement_balance" as const }
        }
        newDisbursementBalance = 0
        nextStatus = "Fully Disbursed"
      } else {
        const bal = roundMoney(balance as number)
        const sum = roundMoney(amount + bal)
        if (!moneyEqual(sum, remainingBefore)) {
          return { error: "amount_and_balance_must_equal_disbursement_balance" as const }
        }
        if (amount > remainingBefore) {
          return { error: "invalid_amount" as const }
        }
        newDisbursementBalance = bal
        nextStatus = bal <= 0 ? "Fully Disbursed" : "Partially Disbursed"
      }

      const productLabel = (loan.loan_product && String(loan.loan_product).trim()) || "Loan"
      const approvedLabel = formatApprovedAt(
        loan.approved_at != null ? String(loan.approved_at) : null,
      )
      const description = `${productLabel} sacco loan disbursement ${approvedLabel || "approved"}`

      const transactionNumber = `SLD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const transactionDate = `${disbursement_date}T12:00:00.000Z`

      const updateWhere = isSuperAdmin
        ? "id = $6 AND institution_id = $7"
        : "id = $6 AND institution_id = $7 AND branch_id = $8"
      const updateParams = isSuperAdmin
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
          await client.query("ROLLBACK")
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
          undefined,
          client
        )

        await client.query(
          `INSERT INTO transactions (
             institution_id, branch_id, member_id, client_id, account_id, loan_id, sacco_loan_id,
             transaction_number, type, amount, mode, description, reference_number,
             balance_before, balance_after, processed_by, transaction_date, status
           )
           VALUES (
             $1, $2, NULL, $3, NULL, NULL, $4,
             $5, 'Loan Disbursement', $6, $7, $8, $9,
             $10, $11, $12, $13::timestamptz, 'Completed'
           )`,
          [
            actor.institution_id,
            loan.branch_id,
            loan.client_id,
            loanId,
            transactionNumber,
            roundMoney(amount),
            disbursement_mode,
            description,
            transactionNumber,
            txBalanceBefore,
            newDisbursementBalance,
            actor.id,
            transactionDate,
          ],
        )
        await auditLogger.logInsert(
          "transactions",
          transactionNumber,
          {
            transaction_number: transactionNumber,
            type: "Loan Disbursement",
            amount: roundMoney(amount),
            mode: disbursement_mode,
            description,
            client_id: loan.client_id,
            sacco_loan_id: loanId,
            balance_before: txBalanceBefore,
            balance_after: newDisbursementBalance,
            transaction_date: transactionDate,
            status: "Completed",
          },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )

        await client.query("COMMIT")
      } catch (e) {
        await client.query("ROLLBACK")
        throw e
      }

      return {
        ok: true as const,
        status: nextStatus,
        disbursement_balance: newDisbursementBalance,
        transaction_number: transactionNumber,
      }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "missing_permission:disburse_sacco_loan" || err === "user_not_linked"
          ? 403
          : err === "not_found"
            ? 404
            : err === "actor_branch_missing"
              ? 400
              : 400
      apiLog("warn", "sacco_loans.disburse.denied", { method: "POST", apiPath, status: statusCode, error: err })
      return NextResponse.json({ error: err }, { status: statusCode })
    }

    apiLog("info", "sacco_loans.disburse.success", { method: "POST", apiPath, status: 200, loanId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.disburse.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
