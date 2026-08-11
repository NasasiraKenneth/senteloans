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
        `SELECT branch_id FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null
      if (!row.branch_id) return []
      const productsRes = await client.query(
        `SELECT id, product_name, description, interest_rate, interest_calculation_method, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months, processing_fee_percentage, collateral_required
         FROM loan_products WHERE branch_id = $1 AND status = 'Active' ORDER BY product_name`,
        [row.branch_id]
      )
      return productsRes.rows.map((p: Record<string, unknown>) => ({
          id: p.id,
          name: p.product_name,
          product_name: p.product_name,
          description: p.description || "",
          interestRate: Number(p.interest_rate || 0),
          interest_rate: Number(p.interest_rate || 0),
          interestCalculationMethod: String(p.interest_calculation_method || "reducing_balance"),
          interest_calculation_method: String(p.interest_calculation_method || "reducing_balance"),
          minAmount: Number(p.minimum_amount || 0),
          minimum_amount: Number(p.minimum_amount || 0),
          maxAmount: Number(p.maximum_amount || 0),
          maximum_amount: Number(p.maximum_amount || 0),
          minTenure: Number(p.minimum_tenure_months || 1),
          minimum_tenure_months: Number(p.minimum_tenure_months || 1),
          maxTenure: Number(p.maximum_tenure_months || 12),
          maximum_tenure_months: Number(p.maximum_tenure_months || 12),
          processingFeePercentage: Number(p.processing_fee_percentage || 0),
          processing_fee_percentage: Number(p.processing_fee_percentage || 0),
          collateralRequired: Boolean(p.collateral_required),
          collateral_required: Boolean(p.collateral_required),
      }))
    })

    if (result === null) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, products: result, items: result })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
