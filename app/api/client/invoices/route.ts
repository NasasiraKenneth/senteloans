import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const memberRes = await client.query(
        `SELECT id, institution_id FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId],
      )
      const member = memberRes.rows[0]
      if (!member) return null

      const invoicesRes = await client.query(
        `SELECT
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
           AND LOWER(TRIM(status)) NOT IN ('draft', 'cancelled')
         ORDER BY invoice_date DESC, created_at DESC`,
        [member.id, member.institution_id],
      )

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
