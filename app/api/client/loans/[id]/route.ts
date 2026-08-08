import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const url = new URL(req.url)
    const page = Math.max(1, Number(url.searchParams.get("page") || 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 10)))
    const offset = (page - 1) * pageSize
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const dateStart = (
      url.searchParams.get("dateStart") ||
      url.searchParams.get("date_from") ||
      url.searchParams.get("startDate") ||
      ""
    ).trim()
    const dateEnd = (
      url.searchParams.get("dateEnd") ||
      url.searchParams.get("date_to") ||
      url.searchParams.get("endDate") ||
      ""
    ).trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const member = clientRes.rows[0]
      if (!member) return null

      const loanRes = await client.query(
        `SELECT 
           l.id, 
           l.application_id, 
           l.member_id, 
           l.loan_product_id, 
           l.principal_amount, 
           l.interest_rate, 
           l.tenure_months, 
           l.outstanding_balance, 
           l.status::text AS status, 
           l.purpose, 
           l.application_date, 
           l.approved_at, 
           l.disbursement_date, 
           l.maturity_date, 
           l.next_payment_date, 
           l.overdue_days, 
           l.created_by,
           lp.product_name
         FROM loans l
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.id = $1 AND l.member_id = $2 AND l.institution_id = $3`,
        [id, member.id, member.institution_id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return null

      let repWhere = `WHERE lr.loan_id = $1`
      const repParams: unknown[] = [loan.id]
      let repArg = 2

      if (statusParam && statusParam !== "all") {
        repWhere += ` AND LOWER(TRIM(lr.status::text)) = $${repArg++}`
        repParams.push(statusParam)
      }

      if (dateStart) {
        repWhere += ` AND lr.due_date::date >= $${repArg++}::date`
        repParams.push(dateStart)
      }

      if (dateEnd) {
        repWhere += ` AND lr.due_date::date <= $${repArg++}::date`
        repParams.push(dateEnd)
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM loan_repayments lr ${repWhere}`,
        repParams
      )
      const totalRepayments = countRes.rows[0]?.total || 0

      const repRes = await client.query(
        `SELECT 
           lr.installment_number, 
           lr.due_date, 
           lr.principal_amount, 
           lr.interest_amount, 
           lr.total_amount, 
           lr.amount_paid, 
           lr.payment_date,
           lr.penalty_amount,
           lr.days_overdue,
           lr.status::text AS status 
         FROM loan_repayments lr 
         ${repWhere} 
         ORDER BY lr.installment_number ASC 
         LIMIT $${repArg++} OFFSET $${repArg++}`,
        [...repParams, pageSize, offset]
      )

      const repayments = repRes.rows.map((r: Record<string, unknown>) => {
        const principal = Number(r.principal_amount || 0)
        const interest = Number(r.interest_amount || 0)
        const totalAmount = Number(r.total_amount || principal + interest)
        const amountPaid = Number(r.amount_paid || 0)
        const penaltyAmount = Number(r.penalty_amount || 0)
        const amountDue = Math.max(0, totalAmount + penaltyAmount - amountPaid)
        return {
          installment: Number(r.installment_number || 0),
          dueDate: r.due_date,
          principal,
          interest,
          totalPayment: totalAmount,
          amountPaid,
          paymentDate: r.payment_date || null,
          penaltyAmount,
          amountDue,
          daysOverdue: Number(r.days_overdue || 0),
          status: String(r.status || "Pending"),
        }
      })

      let loanOfficer: string | null = null
      if (loan.created_by) {
        const uRes = await client.query(`SELECT full_name FROM users WHERE id = $1`, [loan.created_by])
        loanOfficer = uRes.rows[0]?.full_name || null
      }

      const principal = Number(loan.principal_amount || 0)
      const tenure = Math.max(1, Number(loan.tenure_months || 1))
      const monthlyPayment = principal / tenure + (principal * Number(loan.interest_rate || 0)) / 100 / 12

      return {
        loan: {
          id: loan.id,
          applicationId: loan.application_id,
          memberName: member.full_name,
          memberNumber: member.member_number,
          memberId: member.id,
          loanProduct: loan.product_name || "Loan",
          principalAmount: principal,
          interestRate: Number(loan.interest_rate || 0),
          tenure,
          remainingTenure: tenure,
          outstandingBalance: Number(loan.outstanding_balance || 0),
          monthlyPayment: Math.round(monthlyPayment),
          status: String(loan.status || "Applied"),
          purpose: (loan.purpose as string) || "",
          applicationDate: loan.application_date,
          approvalDate: loan.approved_at,
          disbursementDate: loan.disbursement_date,
          maturityDate: loan.maturity_date,
          nextPaymentDate: loan.next_payment_date,
          overdueDays: Number(loan.overdue_days || 0),
          loanOfficer,
          repayments,
        },
        repaymentPagination: {
          page: page - 1,
          pageSize,
          total: totalRepayments,
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
