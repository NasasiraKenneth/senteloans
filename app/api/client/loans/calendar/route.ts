import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) {
      return NextResponse.json({ error: "client_only" }, { status: 403 })
    }

    const url = new URL(req.url)
    const monthParam = (url.searchParams.get("month") || "").trim() // e.g. "2026-08" or "2026-8"
    const yearParam = url.searchParams.get("year")
    const monthIndexParam = url.searchParams.get("monthIndex")

    let targetYear: number
    let targetMonth: number // 1-12

    const now = new Date()
    if (monthParam && monthParam.includes("-")) {
      const [y, m] = monthParam.split("-").map(Number)
      targetYear = !isNaN(y) ? y : now.getFullYear()
      targetMonth = !isNaN(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1
    } else if (yearParam && monthIndexParam !== null) {
      targetYear = parseInt(yearParam, 10) || now.getFullYear()
      targetMonth = (parseInt(monthIndexParam, 10) || 0) + 1
    } else {
      targetYear = now.getFullYear()
      targetMonth = now.getMonth() + 1
    }

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`
    const lastDay = new Date(targetYear, targetMonth, 0).getDate()
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const memberRes = await client.query(
        `SELECT id, institution_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const member = memberRes.rows[0]
      if (!member) return null

      // 1. Fetch repayments in date range (or payments made in date range)
      const repaymentsRes = await client.query(
        `SELECT 
           lr.id,
           lr.loan_id,
           lr.installment_number,
           lr.due_date::text as due_date,
           lr.payment_date::text as payment_date,
           lr.amount_due,
           lr.principal_amount,
           lr.interest_amount,
           lr.total_amount,
           lr.amount_paid,
           lr.status::text as status,
           lr.days_overdue,
           l.application_id,
           lp.product_name
         FROM loan_repayments lr
         JOIN loans l ON l.id = lr.loan_id
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.member_id = $1 AND l.institution_id = $2
           AND (
             (lr.due_date >= $3::date AND lr.due_date <= $4::date)
             OR (lr.payment_date >= $3::date AND lr.payment_date <= $4::date)
           )
         ORDER BY lr.due_date ASC`,
        [member.id, member.institution_id, startDate, endDate]
      )

      // 2. Fetch loan lifecycle events in date range
      const loansRes = await client.query(
        `SELECT 
           l.id,
           l.application_id,
           l.principal_amount,
           l.monthly_payment,
           l.outstanding_balance,
           l.tenure_months,
           l.status::text as status,
           l.application_date::text as application_date,
           l.approved_at::date::text as approval_date,
           l.disbursement_date::text as disbursement_date,
           l.maturity_date::text as maturity_date,
           l.next_payment_date::text as next_payment_date,
           lp.product_name
         FROM loans l
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.member_id = $1 AND l.institution_id = $2
         ORDER BY l.application_date ASC`,
        [member.id, member.institution_id]
      )

      const events: Array<{
        id: string
        dateStr: string
        type: "repayment" | "overdue" | "status_change"
        appId: string
        product: string
        title: string
        amount: number
        status: "Paid" | "Pending" | "Overdue" | "Disbursed" | "Applied" | "Approved" | "Closed"
        description?: string
        installmentNumber?: number
      }> = []

      // Add repayment schedule events
      for (const r of repaymentsRes.rows) {
        const principal = Number(r.principal_amount || 0)
        const interest = Number(r.interest_amount || 0)
        const total = Number(r.total_amount || principal + interest)
        const paid = Number(r.amount_paid || 0)
        const isPaid = r.status === "Paid" || r.status === "Completed"
        const isOverdue = r.status === "Overdue" || Number(r.days_overdue || 0) > 0

        if (r.due_date && r.due_date >= startDate && r.due_date <= endDate) {
          events.push({
            id: `rep-due-${r.id}`,
            dateStr: r.due_date.slice(0, 10),
            type: isOverdue ? "overdue" : "repayment",
            appId: r.application_id || "Loan",
            product: r.product_name || "Credit Facility",
            title: isPaid
              ? `Installment #${r.installment_number} Cleared`
              : isOverdue
                ? `Overdue Installment #${r.installment_number}`
                : `Installment #${r.installment_number} Due`,
            amount: isPaid ? paid || total : total,
            status: isPaid ? "Paid" : isOverdue ? "Overdue" : "Pending",
            description: isPaid
              ? `Scheduled installment #${r.installment_number} cleared successfully.`
              : isOverdue
                ? `Installment is overdue by ${r.days_overdue || 1} day(s). Penalty rules may apply.`
                : `Scheduled installment #${r.installment_number} due date.`,
            installmentNumber: Number(r.installment_number),
          })
        }

        // If payment was made on a different date in the month
        if (r.payment_date && r.payment_date !== r.due_date && r.payment_date >= startDate && r.payment_date <= endDate) {
          events.push({
            id: `rep-paid-${r.id}`,
            dateStr: r.payment_date.slice(0, 10),
            type: "repayment",
            appId: r.application_id || "Loan",
            product: r.product_name || "Credit Facility",
            title: `Payment Received (Installment #${r.installment_number})`,
            amount: paid || total,
            status: "Paid",
            description: `Payment of installment #${r.installment_number} recorded.`,
            installmentNumber: Number(r.installment_number),
          })
        }
      }

      // Add loan lifecycle events for this month
      for (const l of loansRes.rows) {
        const principal = Number(l.principal_amount || 0)
        const monthly = Number(l.monthly_payment || 0)
        const appDate = l.application_date ? l.application_date.slice(0, 10) : null
        const disbDate = l.disbursement_date ? l.disbursement_date.slice(0, 10) : null
        const nextDate = l.next_payment_date ? l.next_payment_date.slice(0, 10) : null
        const matDate = l.maturity_date ? l.maturity_date.slice(0, 10) : null

        if (appDate && appDate >= startDate && appDate <= endDate) {
          events.push({
            id: `loan-app-${l.id}`,
            dateStr: appDate,
            type: "status_change",
            appId: l.application_id,
            product: l.product_name || "Loan",
            title: "Loan Application Submitted",
            amount: principal,
            status: "Applied",
            description: `Application for ${l.product_name || "credit"} submitted for review.`,
          })
        }

        if (disbDate && disbDate >= startDate && disbDate <= endDate) {
          events.push({
            id: `loan-disb-${l.id}`,
            dateStr: disbDate,
            type: "status_change",
            appId: l.application_id,
            product: l.product_name || "Loan",
            title: "Loan Facility Disbursed",
            amount: principal,
            status: "Disbursed",
            description: `Principal loan funds disbursed to member account.`,
          })
        }

        if (matDate && matDate >= startDate && matDate <= endDate) {
          events.push({
            id: `loan-mat-${l.id}`,
            dateStr: matDate,
            type: "status_change",
            appId: l.application_id,
            product: l.product_name || "Loan",
            title: "Loan Facility Maturity Date",
            amount: Number(l.outstanding_balance || 0),
            status: "Closed",
            description: `Maturity date for loan ${l.application_id}.`,
          })
        }

        // If active loan has next_payment_date in this month, and not already covered in repayments
        if (
          nextDate &&
          nextDate >= startDate &&
          nextDate <= endDate &&
          !events.some((e) => e.appId === l.application_id && e.dateStr === nextDate && e.type === "repayment")
        ) {
          events.push({
            id: `loan-next-${l.id}`,
            dateStr: nextDate,
            type: "repayment",
            appId: l.application_id,
            product: l.product_name || "Loan",
            title: "Next Repayment Due",
            amount: monthly || Number(l.outstanding_balance || 0),
            status: "Pending",
            description: `Upcoming monthly installment payment due.`,
          })
        }
      }

      // Sort events by dateStr ascending
      events.sort((a, b) => a.dateStr.localeCompare(b.dateStr))

      return {
        ok: true,
        month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
        year: targetYear,
        monthIndex: targetMonth - 1,
        startDate,
        endDate,
        events,
        totalEvents: events.length,
      }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
