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
import { renderInvoicesPdfBuffer } from "@/app/api/institution/invoices/export/invoices-pdf"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const format = (url.searchParams.get("format") || "pdf").trim().toLowerCase()
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const search = (url.searchParams.get("search") || "").trim()
    const invoiceType = (url.searchParams.get("invoice_type") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || url.searchParams.get("startDate") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || url.searchParams.get("endDate") || "").trim()
    const dueFrom = (url.searchParams.get("due_from") || "").trim()
    const dueTo = (url.searchParams.get("due_to") || "").trim()

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
           id,
           invoice_number,
           invoice_date,
           invoice_due,
           subtotal,
           vat,
           total_amount,
           invoice_type,
           status,
           created_at
         FROM invoices
         WHERE member_id = $1
           AND institution_id = $2
           AND LOWER(TRIM(status::text)) NOT IN ('draft', 'cancelled')
      `
      const params: unknown[] = [member.id, member.institution_id]
      let paramIdx = 3

      if (statusParam && statusParam !== "all") {
        if (statusParam === "paid" || statusParam === "fully paid") {
          query += ` AND LOWER(TRIM(status::text)) IN ('fully paid', 'paid')`
        } else {
          query += ` AND LOWER(TRIM(status::text)) = $${paramIdx++}`
          params.push(statusParam)
        }
      }

      if (search) {
        query += ` AND (invoice_number ILIKE $${paramIdx} OR inwords ILIKE $${paramIdx})`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (invoiceType && invoiceType !== "all") {
        query += ` AND invoice_type = $${paramIdx++}`
        params.push(invoiceType)
      }

      if (dateFrom) {
        query += ` AND invoice_date >= $${paramIdx++}`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND invoice_date <= $${paramIdx++}`
        params.push(dateTo)
      }

      if (dueFrom) {
        query += ` AND invoice_due >= $${paramIdx++}`
        params.push(dueFrom)
      }

      if (dueTo) {
        query += ` AND invoice_due <= $${paramIdx++}`
        params.push(dueTo)
      }

      query += ` ORDER BY invoice_date DESC, created_at DESC`

      const invRes = await client.query(query, params)

      return {
        institutionName,
        memberName: member.full_name,
        memberNumber: member.member_number,
        rows: invRes.rows,
      }
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const date = new Date().toISOString().slice(0, 10)
    const title = `Invoices Statement - ${result.memberName} (${result.memberNumber || "Member"})`

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Invoice #", "Assigned To", "Type", "Status", "Invoice Date", "Due Date", "Subtotal", "VAT", "Total Amount"]
      const ws = workbook.addWorksheet(toSafeExcelSheetName("Invoices"))
      addExcelTitleAndHeaders(ws, title, headers, "A1:I1")
      ws.columns = [
        { width: 20 },
        { width: 24 },
        { width: 18 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 14 },
        { width: 18 },
      ]

      for (const row of result.rows || []) {
        ws.addRow([
          row.invoice_number || row.id || "",
          result.memberName || "",
          row.invoice_type || "",
          row.status || "",
          row.invoice_date ? formatIsoDateForExcel(row.invoice_date) : "",
          row.invoice_due ? formatIsoDateForExcel(row.invoice_due) : "",
          Number(row.subtotal || 0),
          Number(row.vat || 0),
          Number(row.total_amount || 0),
        ])
      }

      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="invoices-statement-${date}.xlsx"`,
        },
      })
    }

    // Default to PDF
    const pdfData = {
      title,
      sheets: [
        {
          branch_name: result.institutionName,
          rows: result.rows.map((r: any) => ({
            invoice_number: String(r.invoice_number || r.id || ""),
            assigned_to: String(result.memberName || ""),
            target_label: "Member",
            invoice_type: String(r.invoice_type || ""),
            status: String(r.status || ""),
            invoice_date: r.invoice_date ? String(r.invoice_date) : null,
            invoice_due: r.invoice_due ? String(r.invoice_due) : null,
            subtotal: Number(r.subtotal || 0),
            vat: Number(r.vat || 0),
            total_amount: Number(r.total_amount || 0),
            created_by_name: "Sacco Billing System",
          })),
        },
      ],
    }

    const pdfBuffer = await renderInvoicesPdfBuffer(pdfData)
    const filename = `invoices-statement-${date}.pdf`
    const headers = new Headers()
    headers.set("Content-Type", "application/pdf")
    headers.set("Content-Disposition", `attachment; filename="${filename}"`)
    headers.set("Cache-Control", "no-store")
    return new NextResponse(new Uint8Array(pdfBuffer), { status: 200, headers })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
