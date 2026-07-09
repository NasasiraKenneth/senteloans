import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import { hasPermission, isSuperAdmin, requireStaffSession, resolveActorContext } from "@/lib/api/rbac"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const sess = await requireStaffSession()
    if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status })

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "user_not_linked" as const }

      const allowed = await hasPermission(client, actor, "view_loans")
      if (!allowed) return { error: "missing_permission:view_loans" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id
         FROM loans
         WHERE id = $1`,
        [id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return null
      if (String(loan.institution_id) !== String(actor.institution_id)) return null
      if (!isSuperAdmin(actor) && String(loan.branch_id) !== String(actor.branch_id)) return null

      const res = await client.query(
        `SELECT installment_number, due_date, principal_amount, interest_amount, total_amount,
                amount_paid, payment_date, penalty_amount, amount_due, days_overdue, status
         FROM loan_repayments WHERE loan_id = $1 ORDER BY installment_number ASC`,
        [id]
      )
      const repayments = res.rows.map((r: Record<string, unknown>) => ({
        installment: r.installment_number,
        due_date: r.due_date,
        principal_amount: r.principal_amount,
        interest_amount: r.interest_amount,
        total_amount: r.total_amount,
        amount_paid: r.amount_paid,
        payment_date: r.payment_date,
        penalty_amount: r.penalty_amount,
        amount_due: r.amount_due,
        days_overdue: r.days_overdue,
        status: r.status,
      }))

      return { repayments }
    })

    if (result && "error" in result) {
      const status = result.error === "missing_permission:view_loans" ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
