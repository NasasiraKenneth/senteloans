import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT institution_id FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null
      const productsRes = await client.query(
        `SELECT id, product_name, description, interest_rate, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months
         FROM loan_products WHERE institution_id = $1 AND status = 'Active' ORDER BY product_name`,
        [row.institution_id]
      )
      return productsRes.rows.map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.product_name,
        description: p.description || "",
        interestRate: Number(p.interest_rate || 0),
        minAmount: Number(p.minimum_amount || 0),
        maxAmount: Number(p.maximum_amount || 0),
        minTenure: Number(p.minimum_tenure_months || 1),
        maxTenure: Number(p.maximum_tenure_months || 12),
      }))
    })

    if (result === null) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, products: result })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
