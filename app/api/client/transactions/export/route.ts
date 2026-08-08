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
import { renderTransactionsPdfBuffer } from "@/app/api/institution/transactions/export/transactions-pdf"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const format = (url.searchParams.get("format") || "pdf").trim().toLowerCase()
    const accountId = (url.searchParams.get("accountId") || url.searchParams.get("account_id") || "").trim()
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const search = (url.searchParams.get("search") || "").trim()
    const type = (url.searchParams.get("type") || "").trim()
    const mode = (url.searchParams.get("mode") || "").trim()
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
           t.id,
           t.transaction_number,
           t.type,
           t.amount,
           t.mode,
           t.description,
           t.balance_after,
           t.transaction_date,
           COALESCE(sa.account_number, '') AS account_number,
           $3 AS assigned_to
         FROM transactions t
         LEFT JOIN savings_accounts sa ON sa.id = t.account_id
         WHERE t.member_id = $1 AND t.institution_id = $2
      `
      const params: unknown[] = [member.id, member.institution_id, member.full_name]
      let paramIdx = 4

      if (statusParam && statusParam !== "all") {
        if (statusParam === "deposit") {
          query += ` AND (LOWER(t.type::text) LIKE '%deposit%' OR t.type::text IN ('Deposit', 'Opening Balance', 'Shares Purchase'))`
        } else if (statusParam === "withdrawal") {
          query += ` AND (LOWER(t.type::text) LIKE '%withdraw%' OR t.type::text = 'Withdrawal')`
        } else if (statusParam === "payment") {
          query += ` AND (LOWER(t.type::text) LIKE '%repay%' OR LOWER(t.type::text) LIKE '%payment%' OR t.type::text IN ('Loan Repayment', 'Fee Payment', 'Interest Payment'))`
        }
      }

      if (search) {
        query += ` AND (
          t.transaction_number ILIKE $${paramIdx}
          OR t.description ILIKE $${paramIdx}
          OR t.type::text ILIKE $${paramIdx}
          OR t.mode::text ILIKE $${paramIdx}
          OR sa.account_number ILIKE $${paramIdx}
        )`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (type && type !== "all") {
        query += ` AND LOWER(TRIM(t.type::text)) = LOWER(TRIM($${paramIdx++}))`
        params.push(type)
      }

      if (mode && mode !== "all") {
        query += ` AND LOWER(TRIM(t.mode::text)) = LOWER(TRIM($${paramIdx++}))`
        params.push(mode)
      }

      if (accountId) {
        query += ` AND (t.account_id = $${paramIdx++} OR sa.id = $${paramIdx - 1})`
        params.push(accountId)
      }

      if (dateFrom) {
        query += ` AND t.transaction_date::date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND t.transaction_date::date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      query += ` ORDER BY t.transaction_date DESC, t.created_at DESC`

      const txRes = await client.query(query, params)

      return {
        institutionName,
        memberName: member.full_name,
        memberNumber: member.member_number,
        rows: txRes.rows,
      }
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const date = new Date().toISOString().slice(0, 10)
    const title = `Transaction Statement - ${result.memberName} (${result.memberNumber || "Member"})`

    if (format === "excel") {
      const workbook = await createExcelWorkbook()
      const headers = ["Txn #", "Assigned To", "Account", "Type", "Amount", "Mode", "Date", "Balance", "Description"]
      const ws = workbook.addWorksheet(toSafeExcelSheetName("Transactions"))
      addExcelTitleAndHeaders(ws, title, headers, "A1:I1")
      ws.columns = [
        { width: 22 },
        { width: 24 },
        { width: 18 },
        { width: 18 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 28 },
      ]

      for (const row of result.rows || []) {
        ws.addRow([
          row.transaction_number || row.id || "",
          row.assigned_to || result.memberName || "",
          row.account_number || "—",
          row.type || "",
          Number(row.amount || 0),
          row.mode || "",
          row.transaction_date ? formatIsoDateForExcel(row.transaction_date) : "",
          Number(row.balance_after || 0),
          row.description || "—",
        ])
      }

      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="transaction-statement-${date}.xlsx"`,
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
            transaction_number: String(r.transaction_number || r.id || ""),
            assigned_to: String(r.assigned_to || result.memberName || ""),
            account_number: String(r.account_number || "—"),
            type: String(r.type || ""),
            amount: Number(r.amount || 0),
            mode: String(r.mode || ""),
            transaction_date: r.transaction_date ? String(r.transaction_date) : null,
            balance_after: Number(r.balance_after || 0),
          })),
        },
      ],
    }

    const pdfBuffer = await renderTransactionsPdfBuffer(pdfData)
    const filename = `transactions-statement-${date}.pdf`
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
