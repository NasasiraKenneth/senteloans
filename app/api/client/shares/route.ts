import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const search = (url.searchParams.get("search") || "").trim()
    const dateFrom = (
      url.searchParams.get("date_from") ||
      url.searchParams.get("startDate") ||
      url.searchParams.get("dateStart") ||
      ""
    ).trim()
    const dateTo = (
      url.searchParams.get("date_to") ||
      url.searchParams.get("endDate") ||
      url.searchParams.get("dateEnd") ||
      ""
    ).trim()
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)))
    const offset = (page - 1) * limit

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      // 1. Resolve client member profile
      const memberRes = await client.query(
        `SELECT id, institution_id, branch_id, full_name, member_number FROM members WHERE auth_id = $1`,
        [session!.user!.authUserId]
      )
      const member = memberRes.rows[0]
      if (!member) return null

      // 2. Fetch institution/branch configuration for shares
      let institutionConfig: Record<string, any> = {}
      if (member.branch_id) {
        const configRes = await client.query(
          `SELECT share_value, minimum_shares, maximum_shares
           FROM config
           WHERE branch_id = $1
           ORDER BY updated_at DESC NULLS LAST
           LIMIT 1`,
          [member.branch_id]
        )
        institutionConfig = configRes.rows[0] || {}
      }

      // 3. Overall lifetime metrics for this member
      const memberTotalsRes = await client.query(
        `SELECT
           COALESCE(SUM(number_of_shares), 0)::numeric AS total_units,
           COALESCE(SUM(total_value), 0)::numeric AS total_value,
           COUNT(id)::int AS total_purchases
         FROM member_shares
         WHERE member_id = $1`,
        [member.id]
      )
      const memberUnits = Number(memberTotalsRes.rows[0]?.total_units || 0)
      const memberTotalValue = Number(memberTotalsRes.rows[0]?.total_value || 0)
      const totalPurchases = Number(memberTotalsRes.rows[0]?.total_purchases || 0)

      // Last share purchase price and date
      const lastPurchaseRes = await client.query(
        `SELECT share_value, purchase_date
         FROM member_shares
         WHERE member_id = $1
         ORDER BY purchase_date DESC, created_at DESC
         LIMIT 1`,
        [member.id]
      )
      const lastShareValue = lastPurchaseRes.rows[0]
        ? Number(lastPurchaseRes.rows[0].share_value || 0)
        : institutionConfig.share_value ? Number(institutionConfig.share_value) : null

      // 4. Query all historical purchases for timeline charting (sorted ascending)
      const allHistoryRes = await client.query(
        `SELECT number_of_shares, share_value, total_value, purchase_date
         FROM member_shares
         WHERE member_id = $1
         ORDER BY purchase_date ASC, created_at ASC`,
        [member.id]
      )
      const allPurchases = allHistoryRes.rows.map((r: any) => ({
        units: Number(r.number_of_shares || 0),
        shareValue: Number(r.share_value || 0),
        totalValue: Number(r.total_value || 0),
        date: r.purchase_date,
      }))

      // 5. Build filtered paginated query for the DataTable
      let whereClause = `WHERE ms.member_id = $1`
      const params: unknown[] = [member.id]
      let paramIdx = 2

      if (search) {
        whereClause += ` AND (
          t.transaction_number ILIKE $${paramIdx}
          OR t.description ILIKE $${paramIdx}
          OR t.reference_number ILIKE $${paramIdx}
          OR ms.number_of_shares::text ILIKE $${paramIdx}
        )`
        params.push(`%${search}%`)
        paramIdx++
      }

      if (dateFrom) {
        whereClause += ` AND ms.purchase_date >= $${paramIdx++}::date`
        params.push(dateFrom)
      }

      if (dateTo) {
        whereClause += ` AND ms.purchase_date <= $${paramIdx++}::date`
        params.push(dateTo)
      }

      // Count query
      const countRes = await client.query(
        `SELECT COUNT(ms.id)::int AS total
         FROM member_shares ms
         LEFT JOIN transactions t ON ms.transaction_id = t.id
         ${whereClause}`,
        params
      )
      const totalFiltered = Number(countRes.rows[0]?.total || 0)

      // Paginated items query
      const queryParams = [...params, limit, offset]
      const itemsRes = await client.query(
        `SELECT
           ms.id,
           ms.transaction_id,
           COALESCE(t.transaction_number, 'TXN-SHARES-' || UPPER(SUBSTRING(ms.id::text, 1, 8))) AS transaction_number,
           t.mode AS payment_mode,
           t.description,
           t.reference_number,
           ms.number_of_shares AS units,
           ms.share_value AS unit_price,
           ms.total_value AS total_value,
           ms.purchase_date AS date,
           ms.created_at
         FROM member_shares ms
         LEFT JOIN transactions t ON ms.transaction_id = t.id
         ${whereClause}
         ORDER BY ms.purchase_date DESC, ms.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        queryParams
      )

      const history = itemsRes.rows.map((r: any) => ({
        id: r.id,
        transaction_id: r.transaction_id,
        transaction_number: r.transaction_number,
        payment_mode: r.payment_mode || "Cash",
        description: r.description || `Purchase of ${Number(r.units)} shares`,
        reference_number: r.reference_number || null,
        units: Number(r.units || 0),
        unitPrice: Number(r.unit_price || 0),
        shareValue: Number(r.unit_price || 0),
        totalValue: Number(r.total_value || 0),
        date: r.date,
        createdAt: r.created_at,
      }))

      const minTarget = institutionConfig.minimum_shares ? Number(institutionConfig.minimum_shares) : 500
      const standardSharePrice = institutionConfig.share_value ? Number(institutionConfig.share_value) : (lastShareValue || 50000)

      return {
        history,
        total: totalFiltered,
        pagination: {
          page,
          limit,
          total: totalFiltered,
          totalPages: Math.ceil(totalFiltered / limit),
        },
        totals: {
          units: memberUnits,
          totalValue: memberTotalValue,
          lastShareValue,
          totalPurchases,
        },
        cooperativeMetrics: {
          saccoTotalShares: memberUnits,
          saccoTotalValue: memberTotalValue,
          holdingWeight: memberUnits > 0 ? 100 : 0,
          pricePerShare: standardSharePrice,
          minTarget,
          votingThreshold: Math.min(200, minTarget),
          membershipStatus: memberUnits > 0 ? "Active Cooperator" : "Pending Shares",
        },
        allPurchases,
      }
    })

    if (result === null) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    console.error("GET /api/client/shares error:", err)
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
