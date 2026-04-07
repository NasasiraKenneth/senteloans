import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toDateOnly(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") {
    const trimmed = value.trim()
    const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
    if (ymd) return ymd[1]
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      return `${y}-${m}-${day}`
    }
    return ""
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ""
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  return ""
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
    const amount = Number(body.amount)
    const payment_date = String(body.payment_date ?? "").trim().slice(0, 10)
    const next_payment_date = String(body.next_payment_date ?? "").trim().slice(0, 10)
    const payment_mode = String(body.payment_mode ?? "Cash").trim()

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return NextResponse.json({ error: "invalid_payment_date" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next_payment_date)) {
      return NextResponse.json({ error: "invalid_next_payment_date" }, { status: 400 })
    }
    if (!["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"].includes(payment_mode)) {
      return NextResponse.json({ error: "invalid_payment_mode" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "l.id = $1 AND l.institution_id = $2"
      const qparams: unknown[] = [loanId, actor.institution_id]
      if (!isSuperAdmin) {
        where += " AND l.branch_id = $3"
        qparams.push(actor.branch_id)
      }

      const loanRes = await client.query<{
        id: string
        branch_id: string
        client_id: string
        loan_product: string | null
        next_payment_date: string | null
        tenure_months: number
        outstanding_balance: string | number
      }>(
        `SELECT l.id, l.branch_id, l.client_id, l.loan_product, l.next_payment_date, l.tenure_months, l.outstanding_balance
         FROM senteloans_institution_loans l
         WHERE ${where}
         LIMIT 1`,
        qparams,
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      const dueDateFromLoan = toDateOnly(loan.next_payment_date)
      const currentDueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateFromLoan) ? dueDateFromLoan : payment_date

      const outstandingBefore = Number(loan.outstanding_balance ?? 0)
      const outstandingAfter = Math.max(0, Math.round((outstandingBefore - amount + Number.EPSILON) * 100) / 100)
      const nextTenureMonths = Math.max(0, Math.floor(Number(loan.tenure_months ?? 0)) - 1)
      const isClosed = outstandingAfter <= 0
      const txNumber = `SLR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const description = `${String(loan.loan_product || "Loan")} repayment`

      await client.query("BEGIN")
      try {
        await client.query(
          `INSERT INTO senteloans_institution_loan_repayments (
             loan_id, due_date, amount_paid, payment_date, status
           ) VALUES ($1, $2, $3, $4, 'Paid'::repayment_status)`,
          [loanId, currentDueDate, amount, payment_date],
        )

        await client.query(
          `UPDATE senteloans_institution_loans
           SET tenure_months = $1,
               outstanding_balance = $2,
               next_payment_date = CASE WHEN $6 THEN NULL ELSE $3::date END,
               status = CASE WHEN $6 THEN 'Closed'::loan_status_type ELSE status END,
               modified_by = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [nextTenureMonths, outstandingAfter, next_payment_date, actor.id, loanId, isClosed],
        )

        await client.query(
          `INSERT INTO senteloans_transactions (
             institution_id, branch_id, member_id, client_id, account_id, loan_id, sacco_loan_id,
             transaction_number, type, amount, mode, description, reference_number,
             balance_before, balance_after, processed_by, transaction_date, status
           )
           VALUES (
             $1, $2, NULL, $3, NULL, NULL, $4,
             $5, 'Loan Repayment', $6, $7, $8, $9,
             $10, $11, $12, $13::timestamptz, 'Completed'
           )`,
          [
            actor.institution_id,
            loan.branch_id,
            loan.client_id,
            loanId,
            txNumber,
            amount,
            payment_mode,
            description,
            txNumber,
            outstandingBefore,
            outstandingAfter,
            actor.id,
            `${payment_date}T12:00:00.000Z`,
          ],
        )

        await client.query("COMMIT")
      } catch (e) {
        await client.query("ROLLBACK")
        throw e
      }

      return { ok: true as const }
    })

    if (result && "error" in result) {
      const err = result.error
      const statusCode =
        err === "user_not_linked" ? 403 : err === "actor_branch_missing" ? 400 : err === "not_found" ? 404 : 400
      apiLog("warn", "sacco_loans.record_payment.denied", { method: "POST", apiPath, status: statusCode, error: err })
      return NextResponse.json({ error: err }, { status: statusCode })
    }

    apiLog("info", "sacco_loans.record_payment.success", { method: "POST", apiPath, status: 201, loanId })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "sacco_loans.record_payment.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
