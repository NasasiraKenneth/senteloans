import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

/**
 * GET /api/admin/institutions/list
 * List all institutions for system_admin with search, status, type filters, stats and pagination.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")?.trim() || ""
    const status = searchParams.get("status") || "ALL"
    const type = searchParams.get("type") || "ALL"
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "9", 10)))
    const offset = (page - 1) * limit

    const result = await runWithoutAuth(async (client) => {
      // 1. Overall stats
      const statsRes = await client.query(
        `SELECT 
           COUNT(*)::int AS total_institutions,
           COUNT(*) FILTER (WHERE status = 'Active')::int AS active_institutions,
           COUNT(*) FILTER (WHERE type = 'SACCO')::int AS saccos,
           COUNT(*) FILTER (WHERE type = 'MFI')::int AS mfis
         FROM institutions
         WHERE type <> 'Money Lender'`
      )
      const stats = {
        totalInstitutions: statsRes.rows[0]?.total_institutions || 0,
        activeInstitutions: statsRes.rows[0]?.active_institutions || 0,
        saccos: statsRes.rows[0]?.saccos || 0,
        mfis: statsRes.rows[0]?.mfis || 0,
      }

      // 2. Build filtered WHERE clause
      const whereConditions: string[] = ["i.type <> 'Money Lender'"]
      const queryParams: unknown[] = []
      let paramIndex = 1

      if (search) {
        whereConditions.push(
          `(i.name ILIKE $${paramIndex} OR i.registration_number ILIKE $${paramIndex} OR b.email ILIKE $${paramIndex} OR b.phone_number ILIKE $${paramIndex})`
        )
        queryParams.push(`%${search}%`)
        paramIndex++
      }

      if (status && status !== "ALL") {
        whereConditions.push(`i.status = $${paramIndex}`)
        queryParams.push(status)
        paramIndex++
      }

      if (type && type !== "ALL") {
        whereConditions.push(`i.type = $${paramIndex}`)
        queryParams.push(type)
        paramIndex++
      }

      const whereClause = whereConditions.join(" AND ")

      // 3. Count total matching rows
      const countSql = `
        SELECT COUNT(*)::int AS count
        FROM institutions i
        LEFT JOIN LATERAL (
          SELECT email, phone_number, address
          FROM branches
          WHERE institution_id = i.id
          ORDER BY created_at ASC
          LIMIT 1
        ) b ON true
        WHERE ${whereClause}
      `
      const countRes = await client.query(countSql, queryParams)
      const totalFiltered = countRes.rows[0]?.count || 0

      // 4. Fetch paginated data
      const dataSql = `
        SELECT 
           i.id, 
           i.name, 
           i.type, 
           i.status, 
           i.registration_number,
           i.license_number,
           i.website,
           i.logo,
           i.created_at,
           b.name AS branch_name,
           bt.name AS branch_type,
           b.email AS email,
           b.phone_number AS phone_number,
           b.address AS address
         FROM institutions i
         LEFT JOIN LATERAL (
           SELECT name, branch_type_id, email, phone_number, address
           FROM branches
           WHERE institution_id = i.id
           ORDER BY created_at ASC
           LIMIT 1
         ) b ON true
         LEFT JOIN branch_types bt ON bt.id = b.branch_type_id
         WHERE ${whereClause}
         ORDER BY i.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      const dataRes = await client.query(dataSql, [...queryParams, limit, offset])

      return {
        data: dataRes.rows,
        pagination: {
          total: totalFiltered,
          page,
          limit,
          totalPages: Math.ceil(totalFiltered / limit) || 1,
        },
        stats,
      }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
