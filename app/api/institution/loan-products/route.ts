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
    const statusParam = url.searchParams.get("status")
    const status = statusParam === null ? "Active" : statusParam
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10), 1), 200)
    const q = (url.searchParams.get("q") || "").trim()

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      let where = "institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
      const params: unknown[] = [session!.user!.authUserId]
      let idx = 2
      if (status) {
        where += ` AND status = $${idx++}`
        params.push(status)
      }
      if (q) {
        where += ` AND (product_name ILIKE $${idx} OR product_code ILIKE $${idx})`
        params.push(`%${q}%`)
        idx++
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

/**
 * POST /api/institution/loan-products
 * Create a new loan product
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = await req.json()
    const {
      product_name, product_code, description,
      minimum_amount, maximum_amount, interest_rate,
      minimum_tenure_months, maximum_tenure_months,
      interest_calculation_method, collateral_required,
      guarantors_required, processing_fee_percentage,
      insurance_required, status,
    } = body

    if (!product_name || !product_code || !minimum_amount || !maximum_amount || !interest_rate || !minimum_tenure_months || !maximum_tenure_months) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const instRes = await client.query(
        `SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const institutionId = instRes.rows[0]?.institution_id
      if (!institutionId) throw new Error("Institution not found")

      const res = await client.query(
        `INSERT INTO senteloans_loan_products
         (institution_id, product_name, product_code, description, minimum_amount, maximum_amount,
          interest_rate, minimum_tenure_months, maximum_tenure_months, interest_calculation_method,
          collateral_required, guarantors_required, processing_fee_percentage, insurance_required, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          institutionId, product_name, product_code, description || null,
          minimum_amount, maximum_amount, interest_rate,
          minimum_tenure_months, maximum_tenure_months,
          interest_calculation_method || "reducing_balance",
          collateral_required || false, guarantors_required || 0,
          processing_fee_percentage || 0, insurance_required || false,
          status || "Active",
        ]
      )
      return res.rows[0]
    })

    return NextResponse.json({ id: result?.id }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    if (err?.message?.includes("uk_loan_products_code")) {
      return NextResponse.json({ error: "A product with this code already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
