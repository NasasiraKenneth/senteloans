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
import { renderLoansPdfBuffer } from "@/app/api/institution/loans/export/loans-pdf"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) {
      return NextResponse.json({ error: "client_only" }, { status: 403 })
    }

    const url = new URL(req.url)
    const format = (url.searchParams.get("format") || "pdf").trim().toLowerCase()
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const search = (url.searchParams.get("search") || "").trim()
    const loanProductParam = (url.searchParams.get("loan_product") || url.searchParams.get("loanProduct") || "").trim()
    const dateFrom = (
      url.searchParams.get("date_from") ||
      url.searchParams.get("dateStart") ||
      url.searchParams.get("startDate") ||
      ""
    ).trim()
    const dateTo = (
      url.searchParams.get("date_to") ||
      url.searchParams.get("dateEnd") ||
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

      let query = `
        SELECT 
          l.id, 
          l.application_id, 
          l.principal_amount, 
          l.interest_rate, 
          l.tenure_months, 
          l.outstanding_balance, 
          l.status::text AS status, 
          l.next_payment_date, 
          l.loan_product_id, 
          l.application_date,
          l.disbursement_date,
          l.overdue_days,
          lp.product_name
        FROM loans l
        LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
        WHERE l.member_id = $1 AND l.institution_id = $2
      `
      const params: unknown[] = [member.id, member.institution_id]
      let paramIdx = 3

      if (statusParam && statusParam !== "all") {
        query += ` AND LOWER(TRIM(l.status::text)) = $${paramIdx++}`
        params.push(statusParam)
      }

      if (loanProductParam && loanProductParam !== "all") {
        const products = loanProductParam.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean)
        if (products.length > 0) {
          query += ` AND (LOWER(TRIM(lp.product_name)) = ANY($${paramIdx}) OR l.loan_product_id::text = ANY($${paramIdx}))`
          params.push(products)
          paramIdx++
        }
      }

      if (search) {
        query += ` AND (l.application_id ILIKE $${paramIdx} OR lp.product_name ILIKE $${paramIdx} OR l.status::text ILIKE $${paramIdx})`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (dateFrom) {
        query += ` AND l.application_date::date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND l.application_date::date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      query += ` ORDER BY l.application_date DESC, l.created_at DESC`

      const loansRes = await client.query(query, params)

      return {
        institutionName,
        memberName: member.full_name,
        memberNumber: member.member_number,
        rows: loansRes.rows,
      }
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const { institutionName, memberName, rows } = result

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const title = `${institutionName} - Credit & Loans Portfolio for ${memberName}`
      const headers = [
        "Application ID",
        "Product",
        "Status",
        "Principal (UGX)",
        "Interest Rate (%)",
        "Tenure (Mo)",
        "Outstanding (UGX)",
        "Applied Date",
        "Next Payment",
      ]
      const sheetName = toSafeExcelSheetName("Loans")
      const ws = workbook.addWorksheet(sheetName)

      addExcelTitleAndHeaders(ws, title, headers, "A1:I1")
      ws.columns = [
        { width: 18 },
        { width: 22 },
        { width: 16 },
        { width: 20 },
        { width: 16 },
        { width: 14 },
        { width: 20 },
        { width: 16 },
        { width: 16 },
      ]

      rows.forEach((r: any) => {
        const added = ws.addRow([
          r.application_id || "",
          r.product_name || "Loan",
          r.status || "",
          Number(r.principal_amount || 0),
          Number(r.interest_rate || 0),
          Number(r.tenure_months || 0),
          Number(r.outstanding_balance || 0),
          r.application_date ? formatIsoDateForExcel(r.application_date) : "",
          r.next_payment_date ? formatIsoDateForExcel(r.next_payment_date) : "",
        ])
        added.eachCell((cell: any) => {
          cell.alignment = { wrapText: true, vertical: "top" }
        })
        added.getCell(1).numFmt = "@"
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const safeTitle = `loans-portfolio-${memberName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeTitle}"`,
        },
      })
    }

    const pdfTitle = `${institutionName} - Loans Portfolio (${memberName})`
    const mappedRows = rows.map((r: any) => ({
      application_id: r.application_id || "",
      member_name: memberName,
      product_name: r.product_name || "Loan",
      status: r.status || "",
      loan_type: "Normal",
      principal_amount: Number(r.principal_amount || 0),
      tenure_months: Number(r.tenure_months || 0),
      remaining_tenure_months: Number(r.tenure_months || 0),
      outstanding_balance: Number(r.outstanding_balance || 0),
      application_date: r.application_date || null,
      next_payment_date: r.next_payment_date || null,
    }))

    const pdfBuffer = await renderLoansPdfBuffer({
      title: pdfTitle,
      sheets: [
        {
          branch_name: "Loans Portfolio",
          rows: mappedRows,
        },
      ],
    })

    const safeTitle = `loans-portfolio-${memberName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`

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
