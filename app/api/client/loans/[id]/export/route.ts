import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import {
  addExcelTitleAndHeaders,
  createExcelWorkbook,
  formatIsoDateForExcel,
  toSafeExcelSheetName,
} from "@/lib/export/server-excel"
import { renderRepaymentSchedulePdfBuffer } from "@/app/api/institution/loans/[id]/repayments/export/repayment-schedule-pdf"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: loanId } = await params
    if (!loanId) return NextResponse.json({ error: "missing_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) {
      return NextResponse.json({ error: "client_only" }, { status: 403 })
    }

    const url = new URL(req.url)
    const format = (url.searchParams.get("format") || "pdf").trim().toLowerCase()
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
      const memberRes = await client.query(
        `SELECT id, institution_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const member = memberRes.rows[0]
      if (!member) return { error: "client_not_found" as const }

      const insRes = await client.query(
        `SELECT name FROM institutions WHERE id = $1`,
        [member.institution_id]
      )
      const institutionName = insRes.rows[0]?.name || "SenteLoans"

      const loanRes = await client.query(
        `SELECT 
           l.id, 
           l.application_id, 
           l.principal_amount, 
           l.interest_rate, 
           l.tenure_months, 
           l.outstanding_balance, 
           l.status::text AS status, 
           lp.product_name
         FROM loans l
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.id = $1 AND l.member_id = $2 AND l.institution_id = $3`,
        [loanId, member.id, member.institution_id]
      )
      const loan = loanRes.rows[0]
      if (!loan) return { error: "loan_not_found" as const }

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
         ORDER BY lr.installment_number ASC`,
        repParams
      )

      return {
        institutionName,
        memberName: member.full_name,
        memberNumber: member.member_number,
        loan,
        repayments: repRes.rows,
      }
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const { institutionName, memberName, loan, repayments } = result

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const title = `${institutionName} - Loan Repayment Schedule (${loan.application_id} - ${memberName})`
      const headers = [
        "Installment #",
        "Due Date",
        "Principal (UGX)",
        "Interest (UGX)",
        "Monthly Due (UGX)",
        "Amount Paid (UGX)",
        "Payment Date",
        "Penalty (UGX)",
        "Amount Due (UGX)",
        "Days Overdue",
        "Status",
      ]
      const sheetName = toSafeExcelSheetName("Schedule")
      const ws = workbook.addWorksheet(sheetName)

      addExcelTitleAndHeaders(ws, title, headers, "A1:K1")
      ws.columns = [
        { width: 14 },
        { width: 16 },
        { width: 18 },
        { width: 16 },
        { width: 18 },
        { width: 18 },
        { width: 16 },
        { width: 14 },
        { width: 18 },
        { width: 14 },
        { width: 14 },
      ]

      repayments.forEach((r: any) => {
        const principal = Number(r.principal_amount || 0)
        const interest = Number(r.interest_amount || 0)
        const total = Number(r.total_amount || principal + interest)
        const paid = Number(r.amount_paid || 0)
        const penalty = Number(r.penalty_amount || 0)
        const due = Math.max(0, total + penalty - paid)

        const added = ws.addRow([
          Number(r.installment_number || 0),
          r.due_date ? formatIsoDateForExcel(r.due_date) : "",
          principal,
          interest,
          total,
          paid,
          r.payment_date ? formatIsoDateForExcel(r.payment_date) : "",
          penalty,
          due,
          Number(r.days_overdue || 0),
          r.status || "Pending",
        ])
        added.eachCell((cell: any) => {
          cell.alignment = { wrapText: true, vertical: "top" }
        })
        added.getCell(1).numFmt = "@"
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const safeTitle = `repayment-schedule-${loan.application_id}-${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeTitle}"`,
        },
      })
    }

    const pdfTitle = `${institutionName} - Loan Repayment Schedule (${loan.application_id})`
    const pdfRows = repayments.map((r: any) => {
      const principal = Number(r.principal_amount || 0)
      const interest = Number(r.interest_amount || 0)
      const total = Number(r.total_amount || principal + interest)
      const paid = Number(r.amount_paid || 0)
      const penalty = Number(r.penalty_amount || 0)
      const due = Math.max(0, total + penalty - paid)

      return {
        installment: Number(r.installment_number || 0),
        due_date: r.due_date || null,
        principal,
        interest,
        monthly_payment: total,
        amount_paid: paid,
        payment_date: r.payment_date || null,
        penalty,
        amount_due: due,
        days_overdue: Number(r.days_overdue || 0),
        status: r.status || "Pending",
      }
    })

    const pdfBuffer = await renderRepaymentSchedulePdfBuffer({
      title: pdfTitle,
      rows: pdfRows,
    })

    const safeTitle = `repayment-schedule-${loan.application_id}-${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle}"`,
      },
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
