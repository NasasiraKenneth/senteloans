import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { notificationService } from "@/lib/notifications/notification-service"
import { NotificationTemplates } from "@/lib/notifications/notification-types"
import { buildRepaymentSchedule, calculateLoanTerms } from "@/lib/loans/calculations"

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const actor = await runWithoutAuth(async (client) => {
      const res = await client.query<{ institution_id: string; role: string }>(
        `SELECT institution_id, role FROM senteloans_users WHERE supabase_user_id = $1 AND status = 'Active'`,
        [session!.user!.authUserId]
      )
      return res.rows[0] ?? null
    })
    if (!actor) return NextResponse.json({ error: "user_not_linked" }, { status: 403 })

    const isSystemAdmin = String(actor.role || "").trim().toLowerCase() === "system_admin"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const loanRes = await client.query(
        `SELECT id, institution_id, client_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, monthly_payment, total_amount, outstanding_balance, status, purpose, collateral_description, application_date, approval_date, disbursement_date, maturity_date, next_payment_date, overdue_days, created_by, created_at, updated_at
         FROM senteloans_loans WHERE id = $1`,
        [id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return null
      if (!isSystemAdmin && String(loan.institution_id) !== String(actor.institution_id)) return null

      let client_name = ""
      let client_number = ""
      if (loan.client_id) {
        const cRes = await client.query(`SELECT id, full_name, client_number FROM senteloans_clients WHERE id = $1`, [loan.client_id])
        client_name = cRes.rows[0]?.full_name || ""
        client_number = cRes.rows[0]?.client_number || ""
      }

      let product_name = ""
      if (loan.loan_product_id) {
        const pRes = await client.query(`SELECT id, product_name FROM senteloans_loan_products WHERE id = $1`, [loan.loan_product_id])
        product_name = pRes.rows[0]?.product_name || ""
      }

      const guarsRes = await client.query(
        `SELECT id, guarantor_client_id, guaranteed_amount, status FROM senteloans_loan_guarantors WHERE loan_id = $1`,
        [loan.id]
      )
      const guarsRows = guarsRes.rows
      let guarantors: Array<{ client_id: string; client_name: string; guaranteed_amount: number; status: string }> = []
      if (guarsRows.length > 0) {
        const gIds = [...new Set(guarsRows.map((g: { guarantor_client_id: string }) => g.guarantor_client_id))]
        const gClientsRes = await client.query(`SELECT id, full_name FROM senteloans_clients WHERE id = ANY($1::uuid[])`, [gIds])
        const gMap: Record<string, string> = Object.fromEntries(gClientsRes.rows.map((c: { id: string; full_name: string }) => [c.id, c.full_name]))
        guarantors = guarsRows.map((g: { guarantor_client_id: string; guaranteed_amount: number; status: string }) => ({
          client_id: g.guarantor_client_id,
          client_name: gMap[g.guarantor_client_id] || "",
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

      return {
        loan: {
          id: loan.id,
          application_id: loan.application_id,
          client_id: loan.client_id,
          client_name,
          client_number,
          loan_product_id: loan.loan_product_id,
          product_name,
          principal_amount: loan.principal_amount,
          interest_rate: loan.interest_rate,
          tenure_months: loan.tenure_months,
          monthly_payment: loan.monthly_payment,
          total_amount: loan.total_amount,
          outstanding_balance: loan.outstanding_balance,
          status: loan.status,
          purpose: loan.purpose,
          collateral_description: loan.collateral_description,
          application_date: loan.application_date,
          approval_date: loan.approval_date,
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
        },
      }
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const newStatus = typeof body.status === "string" ? body.status.trim() : undefined
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : undefined
    const collateral_description = typeof body.collateral_description === "string" ? body.collateral_description.trim() : undefined
    const disbursement_mode = PAYMENT_MODES.includes(body.disbursement_mode as typeof PAYMENT_MODES[number])
      ? (body.disbursement_mode as string)
      : "Cash"
    const disbursement_date = typeof body.disbursement_date === "string" && body.disbursement_date.trim()
      ? body.disbursement_date.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const allowedTargets: Record<string, string[]> = {
      Applied: ["Under Review", "Approved", "Rejected"],
      "Under Review": ["Approved", "Rejected"],
      Approved: ["Disbursed"],
      Rejected: [],
      Disbursed: [],
      Active: [],
      Closed: [],
      Defaulted: [],
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const [loanRes, actorRes] = await Promise.all([
        client.query(`SELECT id, institution_id, client_id, status, approval_date, total_amount, principal_amount, interest_rate, tenure_months, loan_product_id FROM senteloans_loans WHERE id = $1`, [id]),
        client.query(`SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`, [session!.user!.authUserId]),
      ])
      const loan = loanRes.rows[0]
      const actor = actorRes.rows[0]
      if (!loan) return { error: "not_found" as const }
      if (!actor) return { error: "user_not_linked" as const }
      if (loan.institution_id !== actor.institution_id) return { error: "cross_tenant_operation_forbidden" as const }

      const updates: Record<string, unknown> = {}
      if (typeof purpose !== "undefined") updates.purpose = purpose
      if (typeof collateral_description !== "undefined") updates.collateral_description = collateral_description
      if (typeof newStatus !== "undefined") {
        const current = String(loan.status)
        if (!Object.prototype.hasOwnProperty.call(allowedTargets, current)) return { error: "invalid_current_status" as const }
        if (!allowedTargets[current].includes(newStatus)) return { error: "invalid_status_transition" as const }
        updates.status = newStatus
        if (newStatus === "Approved" && !loan.approval_date) {
          updates.approval_date = new Date().toISOString().slice(0, 10)
        }
        if (newStatus === "Disbursed") {
          updates.disbursement_date = disbursement_date
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

      if (Object.keys(updates).length === 0) return { error: "no_updates" as const }

      const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ")
      await client.query(`UPDATE senteloans_loans SET ${setClause} WHERE id = $1`, [id, ...Object.values(updates)])

      if (newStatus === "Disbursed") {
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
              `INSERT INTO senteloans_loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount, status)
               VALUES ($1, $2, $3, $4, $5, 'Pending')
               ON CONFLICT (loan_id, installment_number) DO NOTHING`,
              [id, row.installmentNumber, row.dueDate, row.principalAmount, row.interestAmount]
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

        const disburseTxNumber = `LD-${Date.now()}`
        const amount = Number(loan.principal_amount ?? 0)
        await client.query(
          `INSERT INTO senteloans_transactions (institution_id, client_id, account_id, loan_id, transaction_number, type, amount, mode, description, balance_before, balance_after, processed_by, transaction_date, status)
           VALUES ($1, $2, NULL, $3, $4, 'Loan Disbursement', $5, $6, $7, $8, $9, $10, $11, 'Completed')`,
          [
            actor.institution_id,
            loan.client_id,
            id,
            disburseTxNumber,
            amount,
            disbursement_mode,
            `Loan disbursement - ${id.slice(0, 8)}`,
            0,
            amount,
            actor.id,
            disbursement_date,
          ]
        )
      }

      await client.query(
        `INSERT INTO senteloans_audit_logs (institution_id, user_id, table_name, operation, record_id, new_values) VALUES ($1, $2, 'senteloans_loans', 'UPDATE', $3, $4)`,
        [actor.institution_id, actor.id, id, JSON.stringify(updates)]
      )

      if (newStatus) {
        const loanWithClientRes = await client.query(`SELECT client_id, principal_amount FROM senteloans_loans WHERE id = $1`, [id])
        const loanWithClient = loanWithClientRes.rows[0]
        if (loanWithClient?.client_id) {
          let tpl: { title: string; message: string; actionUrl: string } | null = null
          const notifType = newStatus === "Approved" ? "loan_approved" : newStatus === "Rejected" ? "loan_rejected" : newStatus === "Disbursed" ? "loan_disbursed" : "loan_status_change"
          if (newStatus === "Approved") tpl = NotificationTemplates.loanApproved(id, Number(loanWithClient.principal_amount || 0))
          else if (newStatus === "Rejected") tpl = NotificationTemplates.loanRejected(id, Number(loanWithClient.principal_amount || 0))
          else if (newStatus === "Disbursed") tpl = NotificationTemplates.loanDisbursed(id, Number(loanWithClient.principal_amount || 0))
          if (tpl) {
            await notificationService.create({
              institutionId: actor.institution_id,
              recipientType: "client",
              recipientId: loanWithClient.client_id,
              type: notifType as "loan_approved" | "loan_rejected" | "loan_disbursed" | "loan_status_change",
              title: tpl.title,
              message: tpl.message,
              actionUrl: tpl.actionUrl,
              metadata: { loan_id: id, amount: loanWithClient.principal_amount, status: newStatus },
            }).catch((e) => console.error("Failed to create loan status notification:", e))
          }
        }
      }
      return { ok: true }
    })

    if (result && "error" in result) {
      const status = result.error === "cross_tenant_operation_forbidden" ? 403 : result.error === "not_found" || result.error === "user_not_linked" ? (result.error === "not_found" ? 404 : 403) : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
