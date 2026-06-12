import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id FROM clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const loanRes = await client.query(
        `SELECT id, application_id, client_id, loan_product_id, principal_amount, interest_rate, tenure_months, outstanding_balance, status, purpose, application_date, approval_date, disbursement_date, maturity_date, next_payment_date, overdue_days, created_by FROM loans WHERE id = $1 AND client_id = $2`,
        [id, row.id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return null

      let product_name = "Loan"
      if (loan.loan_product_id) {
        const pRes = await client.query(`SELECT product_name FROM loan_products WHERE id = $1`, [loan.loan_product_id])
        product_name = pRes.rows[0]?.product_name || "Loan"
      }

      const repRes = await client.query(
        `SELECT installment_number, due_date, principal_amount, interest_amount, total_amount, amount_paid, status FROM loan_repayments WHERE loan_id = $1 ORDER BY installment_number ASC`,
        [loan.id]
      )
      const repayments = repRes.rows.map((r: Record<string, unknown>) => ({
        installment: Number(r.installment_number || 0),
        dueDate: r.due_date,
        principalAmount: Number(r.principal_amount || 0),
        interestAmount: Number(r.interest_amount || 0),
        totalAmount: Number(r.total_amount || 0),
        amountPaid: Number(r.amount_paid || 0),
        status: String(r.status || "Pending"),
      }))

      let loanOfficer: string | null = null
      if (loan.created_by) {
        const uRes = await client.query(`SELECT full_name FROM users WHERE id = $1`, [loan.created_by])
        loanOfficer = uRes.rows[0]?.full_name || null
      }

      return {
        loan: {
          id: loan.id,
          applicationId: loan.application_id,
          loanProduct: product_name,
          principalAmount: Number(loan.principal_amount || 0),
          interestRate: Number(loan.interest_rate || 0),
          tenure: Number(loan.tenure_months || 0),
          outstandingBalance: Number(loan.outstanding_balance || 0),
          status: String(loan.status || "Applied"),
          purpose: (loan.purpose as string) || "",
          applicationDate: loan.application_date,
          approvalDate: loan.approval_date,
          disbursementDate: loan.disbursement_date,
          maturityDate: loan.maturity_date,
          nextPaymentDate: loan.next_payment_date,
          overdueDays: Number(loan.overdue_days || 0),
          loanOfficer,
          repayments,
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
