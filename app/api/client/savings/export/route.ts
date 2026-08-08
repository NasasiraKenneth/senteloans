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
import { renderSavingsPdfBuffer } from "@/app/api/institution/savings/export/savings-pdf"

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
    const accountTypeParam = (url.searchParams.get("account_type") || "").trim()
    const dateFrom = (
      url.searchParams.get("date_from") ||
      url.searchParams.get("open_dateStart") ||
      url.searchParams.get("dateStart") ||
      url.searchParams.get("startDate") ||
      ""
    ).trim()
    const dateTo = (
      url.searchParams.get("date_to") ||
      url.searchParams.get("open_dateEnd") ||
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
           sa.id,
           sa.account_number,
           sa.account_type::text AS account_type,
           sa.available_balance,
           sa.total_balance,
           sa.status::text AS status,
           sa.open_date,
           sa.last_transaction_date
         FROM savings_accounts sa
         WHERE sa.member_id = $1 AND sa.institution_id = $2
      `
      const params: unknown[] = [member.id, member.institution_id]
      let paramIdx = 3

      if (statusParam && statusParam !== "all") {
        query += ` AND LOWER(TRIM(sa.status::text)) = $${paramIdx++}`
        params.push(statusParam)
      }

      if (accountTypeParam && accountTypeParam !== "all") {
        const types = accountTypeParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
        if (types.length > 0) {
          query += ` AND LOWER(TRIM(sa.account_type::text)) = ANY($${paramIdx++})`
          params.push(types)
        }
      }

      if (search) {
        query += ` AND (
          sa.account_number ILIKE $${paramIdx}
          OR sa.account_type::text ILIKE $${paramIdx}
          OR sa.status::text ILIKE $${paramIdx}
        )`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (dateFrom) {
        query += ` AND sa.open_date::date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND sa.open_date::date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      query += ` ORDER BY sa.open_date DESC, sa.created_at DESC`

      const accRes = await client.query(query, params)

      return {
        institutionName,
        memberName: member.full_name,
        memberNumber: member.member_number,
        rows: accRes.rows,
      }
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const { institutionName, memberName, rows } = result

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const title = `${institutionName} - Cooperative Savings Accounts for ${memberName}`
      const headers = [
        "Account Number",
        "Account Type",
        "Status",
        "Available Balance (UGX)",
        "Total Balance (UGX)",
        "Opened Date",
      ]
      const sheetName = toSafeExcelSheetName("Savings")
      const ws = workbook.addWorksheet(sheetName)

      addExcelTitleAndHeaders(ws, title, headers, "A1:F1")
      ws.columns = [
        { width: 22 },
        { width: 20 },
        { width: 16 },
        { width: 24 },
        { width: 24 },
        { width: 18 },
      ]

      rows.forEach((r: any) => {
        const added = ws.addRow([
          r.account_number || "",
          r.account_type || "",
          r.status || "",
          Number(r.available_balance || 0),
          Number(r.total_balance || 0),
          r.open_date ? formatIsoDateForExcel(r.open_date) : "",
        ])
        added.eachCell((cell: any) => {
          cell.alignment = { wrapText: true, vertical: "top" }
        })
        added.getCell(1).numFmt = "@"
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const safeTitle = `savings-accounts-${memberName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeTitle}"`,
        },
      })
    }

    const pdfTitle = `${institutionName} - Savings Accounts (${memberName})`
    const mappedRows = rows.map((r: any) => ({
      account_number: r.account_number || "",
      account_type: r.account_type || "",
      member_name: memberName,
      status: r.status || "",
      available_balance: Number(r.available_balance || 0),
      total_balance: Number(r.total_balance || 0),
      open_date: r.open_date || null,
    }))

    const pdfBuffer = await renderSavingsPdfBuffer({
      title: pdfTitle,
      sheets: [
        {
          branch_name: "Savings Accounts Portfolio",
          rows: mappedRows,
        },
      ],
    })

    const safeTitle = `savings-accounts-${memberName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`

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
