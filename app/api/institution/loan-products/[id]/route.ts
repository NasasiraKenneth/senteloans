import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/institution/loan-products/[id]
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const { id } = await params

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const res = await client.query(
        `SELECT id, product_name, product_code, description, minimum_amount, maximum_amount,
                interest_rate, minimum_tenure_months, maximum_tenure_months,
                interest_calculation_method, collateral_required, guarantors_required,
                processing_fee_percentage, insurance_required, status
         FROM senteloans_loan_products
         WHERE id = $1
           AND institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $2)`,
        [id, session!.user!.authUserId]
      )
      return res.rows[0] || null
    })

    if (!result) return NextResponse.json({ error: "Product not found" }, { status: 404 })
    return NextResponse.json({ product: result })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * PUT /api/institution/loan-products/[id]
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const { id } = await params
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

    await runWithAuth(session.user.authUserId, async (client) => {
      await client.query(
        `UPDATE senteloans_loan_products SET
           product_name = $1, product_code = $2, description = $3,
           minimum_amount = $4, maximum_amount = $5, interest_rate = $6,
           minimum_tenure_months = $7, maximum_tenure_months = $8,
           interest_calculation_method = $9, collateral_required = $10,
           guarantors_required = $11, processing_fee_percentage = $12,
           insurance_required = $13, status = $14, updated_at = NOW()
         WHERE id = $15
           AND institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $16)`,
        [
          product_name, product_code, description || null,
          minimum_amount, maximum_amount, interest_rate,
          minimum_tenure_months, maximum_tenure_months,
          interest_calculation_method || "reducing_balance",
          collateral_required || false, guarantors_required || 0,
          processing_fee_percentage || 0, insurance_required || false,
          status || "Active", id, session!.user!.authUserId,
        ]
      )
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const err = e as Error
    if (err?.message?.includes("uk_loan_products_code")) {
      return NextResponse.json({ error: "A product with this code already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
