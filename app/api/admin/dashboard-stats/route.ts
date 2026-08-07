import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

/**
 * GET /api/admin/dashboard-stats
 * Returns system-wide stats for system_admin dashboard excluding Money Lender institutions.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const stats = await runWithoutAuth(async (client) => {
      // 1. Aggregated counts in a single efficient query to avoid pg client concurrent execution warnings
      const countsRes = await client.query(`
  SELECT 
    COUNT(*) FILTER (
      WHERE type <> 'Money Lender'
    )::int AS institutions_count,

    COUNT(*) FILTER (
      WHERE status = 'Active'
      AND type <> 'Money Lender'
    )::int AS active_count,

    COUNT(*) FILTER (
      WHERE status = 'Inactive'
      AND type <> 'Money Lender'
    )::int AS inactive_count,

    COUNT(*) FILTER (
      WHERE status = 'Suspended'
      AND type <> 'Money Lender'
    )::int AS pending_count,

    COUNT(*) FILTER (
      WHERE type = 'SACCO'
    )::int AS sacco_count,

    COUNT(*) FILTER (
      WHERE type = 'MFI'
    )::int AS mfi_count

  FROM institutions
`)

      // 2. Recent institutions list
      const recentRes = await client.query(`
        SELECT id, name, type, status, created_at 
        FROM institutions 
        WHERE type <> 'Money Lender' 
        ORDER BY created_at DESC LIMIT 5
      `)

      // 3. Total users across non-Money Lender institutions & system admins
      const usersRes = await client.query(`
        SELECT COUNT(*)::int AS c 
        FROM users u
        LEFT JOIN institutions i ON i.id = u.institution_id
        WHERE i.type IS NULL OR i.type <> 'Money Lender'
      `)

      const c = countsRes.rows[0] || {}

      return {
        institutionsCount: c.institutions_count ?? 0,
        recentInstitutions: recentRes.rows || [],
        totalUsers: usersRes.rows[0]?.c ?? 0,
        pendingInstitutions: c.pending_count ?? 0,
        saccoCount: c.sacco_count ?? 0,
        moneyLenderCount: 0,
        mfiCount: c.mfi_count ?? 0,
        activeInstitutions: c.active_count ?? 0,
        inactiveInstitutions: c.inactive_count ?? 0,
      }
    })

    return NextResponse.json(stats)
  } catch (e: unknown) {
    const err = e as Error
    console.error("Dashboard stats error:", err)
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
