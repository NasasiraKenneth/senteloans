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
import { renderSharesPdfBuffer } from "./shares-pdf"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const format = (url.searchParams.get("format") || "pdf").trim().toLowerCase()
    const search = (url.searchParams.get("search") || "").trim()
    const dateFrom = (
      url.searchParams.get("date_from") ||
      url.searchParams.get("startDate") ||
      url.searchParams.get("dateStart") ||
      ""
    ).trim()
    const dateTo = (
      url.searchParams.get("date_to") ||
      url.searchParams.get("endDate") ||
      url.searchParams.get("dateEnd") ||
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
      const institutionName = insRes.rows[0]?.name || "SenteLoans SACCO"

      let whereClause = `WHERE ms.member_id = $1`
      const params: unknown[] = [member.id]
      let paramIdx = 2

      if (search) {
        whereClause += ` AND (
          t.transaction_number ILIKE $${paramIdx}
          OR t.description ILIKE $${paramIdx}
          OR t.reference_number ILIKE $${paramIdx}
          OR ms.number_of_shares::text ILIKE $${paramIdx}
        )`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (dateFrom) {
        whereClause += ` AND ms.date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        whereClause += ` AND ms.date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      const query = `
        SELECT
          ms.id,
          ms.transaction_id,
          COALESCE(t.transaction_number, 'TXN-SHARES-' || UPPER(SUBSTRING(ms.id::text, 1, 8))) AS transaction_number,
          t.mode AS payment_mode,
          t.description,
          ms.number_of_shares AS units,
          ms.share_value AS unit_price,
          ms.total_value AS total_value,
          ms.date AS date,
          ms.created_at
        FROM member_shares ms
        LEFT JOIN transactions t ON ms.transaction_id = t.id
        ${whereClause}
        ORDER BY ms.date DESC, ms.created_at DESC
      `

      const rowsRes = await client.query(query, params)
      const totalUnits = rowsRes.rows.reduce((sum: number, r: any) => sum + Number(r.units || 0), 0)
      const totalValue = rowsRes.rows.reduce((sum: number, r: any) => sum + Number(r.total_value || 0), 0)

      return {
        institutionName,
        memberName: member.full_name,
        memberNumber: member.member_number,
        rows: rowsRes.rows,
        totalUnits,
        totalValue,
      }
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const date = new Date().toISOString().slice(0, 10)
    const title = `Cooperative Shares Statement - ${result.memberName} (${result.memberNumber || "Member"})`

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Txn #", "Units Acquired", "Unit Price (UGX)", "Total Investment (UGX)", "Purchase Date", "Description"]
      const ws = workbook.addWorksheet(toSafeExcelSheetName("Shares"))
      addExcelTitleAndHeaders(ws, title, headers, "A1:F1")
      ws.columns = [
        { width: 22 },
        { width: 18 },
        { width: 20 },
        { width: 22 },
        { width: 16 },
        { width: 30 },
      ]

      for (const row of result.rows || []) {
        ws.addRow([
          row.transaction_number || "",
          Number(row.units || 0),
          Number(row.unit_price || 0),
          Number(row.total_value || 0),
          row.date ? formatIsoDateForExcel(row.date) : "",
          row.description || "Share Purchase",
        ])
      }

      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="shares-statement-${date}.xlsx"`,
        },
      })
    }

    // Default to PDF
    const pdfBuffer = await renderSharesPdfBuffer({
      title,
      memberName: result.memberName,
      memberNumber: result.memberNumber,
      institutionName: result.institutionName,
      rows: result.rows,
      totalUnits: result.totalUnits,
      totalValue: result.totalValue,
    })

    const filename = `shares-statement-${date}.pdf`
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
