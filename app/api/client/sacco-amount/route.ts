import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

/**
 * GET /api/client/sacco-amount
 * Returns the current/latest total SACCO amount for the logged-in member's branch
 * from the daily_finances table, prioritizing the staff user in the member's created_by column.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const data = await runWithAuth(session.user.authUserId, async (client) => {
      // 1. Fetch member's branch_id, institution_id, and created_by
      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id, created_by, full_name, member_number
         FROM members
         WHERE auth_id = $1
         LIMIT 1`,
        [session.user.authUserId]
      )
      const member = memberRes.rows[0]
      if (!member) return null

      if (!member.branch_id) {
        return {
          totalAmount: 0,
          availableBalance: 0,
          bankTotalAmount: 0,
          mobileMoneyAmount: 0,
          cashAmount: 0,
          branchName: null,
          recordedAt: null,
          createdBy: null,
        }
      }

      // 2. Query daily_finances for the member's branch_id, prioritizing created_by
      const financeRes = await client.query(
        `SELECT df.id,
                COALESCE(df.total_amount, 0)::numeric AS total_amount,
                COALESCE(df.available_balance, 0)::numeric AS available_balance,
                COALESCE(df.bank_total_amount, 0)::numeric AS bank_total_amount,
                COALESCE(df.mobile_money_amount, 0)::numeric AS mobile_money_amount,
                COALESCE(df.cash_amount, 0)::numeric AS cash_amount,
                df.created_by,
                df.created_at,
                b.name AS branch_name
         FROM daily_finances df
         LEFT JOIN branches b ON b.id = df.branch_id
         WHERE df.institution_id = $1
           AND df.branch_id = $2
         ORDER BY
           CASE WHEN $3::uuid IS NOT NULL AND df.created_by = $3::uuid THEN 0 ELSE 1 END,
           df.created_at DESC
         LIMIT 1`,
        [member.institution_id, member.branch_id, member.created_by || null]
      )

      const row = financeRes.rows[0]
      if (!row) {
        return {
          totalAmount: 0,
          availableBalance: 0,
          bankTotalAmount: 0,
          mobileMoneyAmount: 0,
          cashAmount: 0,
          branchName: null,
          recordedAt: null,
          createdBy: null,
        }
      }

      return {
        totalAmount: Number(row.total_amount || 0),
        availableBalance: Number(row.available_balance || 0),
        bankTotalAmount: Number(row.bank_total_amount || 0),
        mobileMoneyAmount: Number(row.mobile_money_amount || 0),
        cashAmount: Number(row.cash_amount || 0),
        branchName: row.branch_name || null,
        recordedAt: row.created_at || null,
        createdBy: row.created_by || null,
      }
    })

    if (!data) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
