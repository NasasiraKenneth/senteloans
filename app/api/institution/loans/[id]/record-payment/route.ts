import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { buildRepaymentSchedule } from "@/lib/loans/calculations"
import { auditLogger } from "@/lib/audit/audit-logger"
import { makePrefixedNumber } from "@/lib/ids/prefixed-number"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: loanId } = await params
    if (!loanId) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const amount = Number(body.amount)
    const payment_date = typeof body.payment_date === "string" && body.payment_date.trim()
      ? body.payment_date.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    const mode = PAYMENT_MODES.includes(body.mode as typeof PAYMENT_MODES[number])
      ? (body.mode as string)
      : "Cash"

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }

    // Resolve staff actor without RLS so institution admins (and any staff) are always found
    const actor = await runWithoutAuth(async (client) => {
      const res = await client.query<{ id: string; institution_id: string; role: string }>(
        `SELECT
           u.id,
           u.institution_id,
          CASE
            WHEN r.name = 'System Admin' THEN 'system_admin'
            WHEN r.name = 'Super Admin' THEN 'super_admin'
            WHEN r.name = 'Admin' THEN 'institution_admin'
            WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
            ELSE NULL
          END AS role
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1 AND u.status = 'Active'`,
        [session!.user!.authUserId]
      )
      return res.rows[0] ?? null
    })
    if (!actor) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const loanRes = await client.query(
        `SELECT l.id, l.institution_id, l.branch_id, l.member_id, l.outstanding_balance, l.status, l.principal_amount, l.interest_rate, l.tenure_months, l.disbursement_date,
                lp.interest_calculation_method
         FROM loans l
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.id = $1`,
        [loanId]
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "not_found" as const }

      const loanInstitutionId = String((loan as { institution_id: unknown }).institution_id ?? "").trim().toLowerCase()
      const actorInstitutionId = String(actor.institution_id ?? "").trim().toLowerCase()
      const isSystemAdmin = String(actor.role || "").trim().toLowerCase() === "system_admin"

      if (!loanInstitutionId) return { error: "invalid_loan" as const }

      // Institution staff can only record payments for loans in their institution (system admins can do any)
      if (!isSystemAdmin && loanInstitutionId !== actorInstitutionId) {
        return {
          error: "cross_tenant_operation_forbidden" as const,
          message: "This loan belongs to another institution. Log in with that institution's staff account to record payments.",
        }
      }

      const institutionId = isSystemAdmin ? loanInstitutionId : actorInstitutionId

      const status = String(loan.status)
      if (status !== "Fully Disbursed" && status !== "Partially Disbursed" && status !== "Active") {
        return { error: "loan_not_eligible_for_payment" as const }
      }

      let repRes = await client.query(
        `SELECT id, installment_number, due_date, total_amount, penalty_amount, amount_due, amount_paid, status
         FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC`,
        [loanId]
      )
      let rows = repRes.rows as Array<{
        id: string
        installment_number: number
        due_date: string
        total_amount: string
        penalty_amount: string
        amount_due: string
        amount_paid: string
        status: string
      }>

      if (rows.length === 0) {
        const anyRepRes = await client.query(
          `SELECT 1 FROM loan_repayments WHERE loan_id = $1 LIMIT 1`,
          [loanId]
        )
        if (anyRepRes.rows.length === 0) {
          const principal = Number((loan as { principal_amount?: unknown }).principal_amount ?? 0)
          const annualRate = Number((loan as { interest_rate?: unknown }).interest_rate ?? 0)
          const tenureMonths = Math.floor(Number((loan as { tenure_months?: unknown }).tenure_months ?? 0))
          const disbursementDateStr = toDateString((loan as { disbursement_date?: unknown }).disbursement_date ?? new Date().toISOString().slice(0, 10))
          if (tenureMonths > 0 && principal > 0) {
            const schedule = buildRepaymentSchedule({
              principal,
              annualRate,
              tenureMonths,
              method: (loan as { interest_calculation_method?: unknown }).interest_calculation_method,
              startDate: disbursementDateStr,
            })
            for (const row of schedule) {
              await client.query(
                `INSERT INTO loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount, amount_due, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
                 ON CONFLICT (loan_id, installment_number) DO NOTHING`,
                [loanId, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount, row.totalAmount]
              )
            }
            const currentOutstanding = Number(loan.outstanding_balance || 0)
            if (currentOutstanding <= 0) {
              const sumRes = await client.query(
                `SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM loan_repayments WHERE loan_id = $1`,
                [loanId]
              )
              const scheduleTotal = Number(sumRes.rows[0]?.total ?? 0)
              if (scheduleTotal > 0) {
                await client.query(
                  `UPDATE loans SET outstanding_balance = $1, updated_at = NOW() WHERE id = $2`,
                  [scheduleTotal, loanId]
                )
                ;(loan as { outstanding_balance?: number }).outstanding_balance = scheduleTotal
              }
            }
            repRes = await client.query(
              `SELECT id, installment_number, due_date, total_amount, penalty_amount, amount_due, amount_paid, status
               FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC`,
              [loanId]
            )
            rows = repRes.rows as typeof rows
          }
        }
      }
      if (rows.length === 0) {
        return {
          error: "no_unpaid_installments" as const,
          message: "No unpaid installments. The repayment schedule may be missing (loan may have no tenure or disbursement date) or all installments are already paid.",
        }
      }

      let remaining = amount
      const installmentChanges: Array<{
        id: string
        old: { amount_paid: number; amount_due: number; status: string; payment_date: string | null }
        next: { amount_paid: number; amount_due: number; status: string; payment_date: string }
      }> = []
      for (const row of rows) {
        if (remaining <= 0) break
        const total = Number(row.amount_due || 0)
        const paid = Number(row.amount_paid || 0)
        const due = total - paid
        const apply = Math.min(remaining, due)
        if (apply <= 0) continue
        const newPaid = paid + apply
        const baseTotal = Number(row.total_amount || 0) + Number(row.penalty_amount || 0)
        const newAmountDue = Math.max(0, baseTotal - newPaid)
        const newStatus = newAmountDue <= 0 ? "Paid" : "Partial"
        await client.query(
          `UPDATE loan_repayments
           SET amount_paid = $1, amount_due = $2, payment_date = $3, status = $4, updated_at = NOW()
           WHERE id = $5`,
          [newPaid, newAmountDue, payment_date, newStatus, row.id]
        )
        installmentChanges.push({
          id: row.id,
          old: {
            amount_paid: paid,
            amount_due: Number(row.amount_due || 0),
            status: String(row.status || "Pending"),
            payment_date: null,
          },
          next: {
            amount_paid: newPaid,
            amount_due: newAmountDue,
            status: newStatus,
            payment_date,
          },
        })
        remaining -= apply
      }

      const totalApplied = amount - remaining
      if (totalApplied <= 0) return { error: "amount_exceeds_due" as const }

      const balanceBefore = Number(loan.outstanding_balance || 0)
      const balanceAfter = Math.max(0, balanceBefore - totalApplied)

      const nextStatus = balanceAfter <= 0
        ? "Closed"
        : (String(loan.status) === "Fully Disbursed" || String(loan.status) === "Partially Disbursed" ? "Active" : String(loan.status))
      await client.query(
        `UPDATE loans SET outstanding_balance = $1, status = $2, updated_at = NOW() WHERE id = $3`,
        [balanceAfter, nextStatus, loanId]
      )

      const nextRes = await client.query(
        `SELECT due_date FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid' ORDER BY installment_number ASC LIMIT 1`,
        [loanId]
      )
      const nextDue = nextRes.rows[0]?.due_date ?? null
      const remainingRes = await client.query(
        `SELECT COUNT(*)::int AS remaining_installments FROM loan_repayments WHERE loan_id = $1 AND status != 'Paid'`,
        [loanId]
      )
      const remainingInstallments = Number(remainingRes.rows[0]?.remaining_installments ?? 0)
      if (nextDue !== null) {
        await client.query(
          `UPDATE loans SET next_payment_date = $1, tenure_months = $2, updated_at = NOW() WHERE id = $3`,
          [nextDue, remainingInstallments, loanId]
        )
      } else {
        await client.query(
          `UPDATE loans SET next_payment_date = NULL, tenure_months = 0, updated_at = NOW() WHERE id = $1`,
          [loanId]
        )
        await client.query(
          `UPDATE loans SET status = 'Closed', updated_at = NOW() WHERE id = $1`,
          [loanId]
        )
      }

      let txRes: { rows: Array<{ id: string }> } | null = null
      let transaction_number = ""
      for (let i = 0; i < 8; i++) {
        transaction_number = makePrefixedNumber("LR")
        try {
          txRes = await client.query(
            `INSERT INTO transactions (institution_id, branch_id, member_id, account_id, loan_id, transaction_number, type, amount, mode, description, balance_before, balance_after, processed_by, transaction_date, status)
             VALUES ($1, $2, $3, NULL, $4, $5, 'Loan Repayment', $6, $7, $8, $9, $10, $11, $12, 'Completed')
             RETURNING id`,
            [
              institutionId,
              loan.branch_id,
              loan.member_id,
              loanId,
              transaction_number,
              totalApplied,
              mode,
              `Loan payment - ${loanId.slice(0, 8)}`,
              balanceBefore,
              balanceAfter,
              actor.id,
              payment_date,
            ]
          )
          break
        } catch (e: any) {
          if (String(e?.code) === "23505") continue
          throw e
        }
      }
      if (!txRes) return { error: "repayment_transaction_number_generation_failed" as const }
      const transactionId = String(txRes.rows[0]?.id || "")
      if (transactionId) {
        await auditLogger.logInsert(
          "transactions",
          transactionId,
          {
            member_id: loan.member_id,
            loan_id: loanId,
            transaction_number,
            type: "Loan Repayment",
            amount: totalApplied,
            mode,
            description: `Loan payment - ${loanId.slice(0, 8)}`,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            transaction_date: payment_date,
            status: "Completed",
          },
          institutionId,
          actor.id,
          undefined,
          client
        )
      }

      await auditLogger.logUpdate(
        "loans",
        loanId,
        {
          outstanding_balance: balanceBefore,
          status: String(loan.status || ""),
        },
        {
          outstanding_balance: balanceAfter,
          status: nextStatus,
          next_payment_date: nextDue ?? null,
          tenure_months: nextDue !== null ? remainingInstallments : 0,
        },
        institutionId,
        actor.id,
        undefined,
        client
      )

      await auditLogger.logUpdate(
        "loan_repayments",
        loanId,
        {
          total_payment: amount,
          mode,
          affected_installments: installmentChanges.map((c) => ({ id: c.id, ...c.old })),
        },
        {
          total_applied: totalApplied,
          payment_date,
          mode,
          affected_installments: installmentChanges.map((c) => ({ id: c.id, ...c.next })),
        },
        institutionId,
        actor.id,
        undefined,
        client
      )

      if (loan.member_id) {
        const tpl = NotificationTemplates.paymentReceived(loanId, totalApplied)
        await notificationService
          .create(
            {
              institutionId,
              branchId: String(loan.branch_id || ""),
              recipientType: "member",
              recipientId: loan.member_id,
              type: "payment_received",
              title: tpl.title,
              message: tpl.message,
              actionUrl: tpl.actionUrl,
              metadata: {
                loan_id: loanId,
                amount: totalApplied,
                balance_after: balanceAfter,
                payment_date,
              },
            },
            client
          )
          .catch((e) => console.error("Failed to create payment_received notification:", e))
      }

      return { ok: true, amount_applied: totalApplied, balance_after: balanceAfter }
    })

    if (result && "error" in result) {
      const status =
        result.error === "cross_tenant_operation_forbidden" ? 403
        : result.error === "not_found" ? 404
        : 400
      const body = "message" in result && typeof result.message === "string"
        ? { error: result.error, message: result.message }
        : { error: result.error }
      return NextResponse.json(body, { status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
