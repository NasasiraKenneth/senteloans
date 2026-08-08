import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase()
    const search = (url.searchParams.get("search") || "").trim()
    const invoiceType = (url.searchParams.get("invoice_type") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || url.searchParams.get("startDate") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || url.searchParams.get("endDate") || "").trim()
    const dueFrom = (url.searchParams.get("due_from") || "").trim()
    const dueTo = (url.searchParams.get("due_to") || "").trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const memberRes = await client.query(
        `SELECT id, institution_id, full_name FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId],
      )
      const member = memberRes.rows[0]
      if (!member) return null

      let query = `
        SELECT
           i.id,
           i.invoice_number,
           i.invoice_date,
           i.invoice_due,
           i.subtotal,
           i.vat,
           i.total_amount,
           i.invoice_type,
           i.status,
           i.created_at,
           $3 AS client_name,
           u.full_name AS staff_name
        FROM invoices i
        LEFT JOIN users u ON u.id = i.created_by
        WHERE i.member_id = $1
          AND i.institution_id = $2
          AND LOWER(TRIM(i.status)) NOT IN ('draft', 'cancelled')
      `
      const params: unknown[] = [member.id, member.institution_id, member.full_name]
      let paramIdx = 4

      if (statusParam && statusParam !== "all") {
        if (statusParam === "paid" || statusParam === "fully paid") {
          query += ` AND LOWER(TRIM(i.status)) IN ('fully paid', 'paid')`
        } else {
          query += ` AND LOWER(TRIM(i.status)) = $${paramIdx++}`
          params.push(statusParam)
        }
      }

      if (search) {
        query += ` AND (i.invoice_number ILIKE $${paramIdx} OR i.inwords ILIKE $${paramIdx})`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (invoiceType && invoiceType !== "all") {
        query += ` AND i.invoice_type = $${paramIdx++}`
        params.push(invoiceType)
      }

      if (dateFrom) {
        query += ` AND i.invoice_date >= $${paramIdx++}`
        params.push(dateFrom)
      }

      if (dateTo) {
        query += ` AND i.invoice_date <= $${paramIdx++}`
        params.push(dateTo)
      }

      if (dueFrom) {
        query += ` AND i.invoice_due >= $${paramIdx++}`
        params.push(dueFrom)
      }

      if (dueTo) {
        query += ` AND i.invoice_due <= $${paramIdx++}`
        params.push(dueTo)
      }

      query += ` ORDER BY i.invoice_date DESC, i.created_at DESC`

      const invoicesRes = await client.query(query, params)

      return invoicesRes.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
        invoiceDue: row.invoice_due,
        subtotal: Number(row.subtotal || 0),
        vat: Number(row.vat || 0),
        totalAmount: Number(row.total_amount || 0),
        invoiceType: row.invoice_type,
        status: row.status,
        clientName: row.client_name,
        staffName: row.staff_name,
        createdAt: row.created_at,
      }))
    })

    if (result === null) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json({ invoices: result })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
