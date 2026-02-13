import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/institution/loan-products
 * Query params: status (defaults to Active), limit
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const url = new URL(req.url)
    const status = url.searchParams.get("status") || "Active"
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10), 1), 200)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      let where = "institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
      const params: unknown[] = [session!.user!.authUserId]
      let idx = 2
      if (status) {
        where += ` AND status = $${idx++}`
        params.push(status)
      }
      params.push(limit)
      const res = await client.query(
        `SELECT id, product_name, product_code, description, minimum_amount, maximum_amount, interest_rate, minimum_tenure_months, maximum_tenure_months, interest_calculation_method, collateral_required, guarantors_required, processing_fee_percentage, insurance_required, status
         FROM senteloans_loan_products WHERE ${where} ORDER BY product_name ASC LIMIT $${idx}`,
        params
      )
      return res.rows
    })

    return NextResponse.json({ items: result ?? [] })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
