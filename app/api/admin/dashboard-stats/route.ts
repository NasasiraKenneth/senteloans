import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

/**
 * GET /api/admin/dashboard-stats
 * Returns system-wide stats for system_admin dashboard.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const stats = await runWithoutAuth(async (client) => {
      // status_type for institutions: Active, Inactive, Suspended, Closed (no Pending)
      const [instRes, recentRes, usersRes, suspendedRes, saccoRes, mlRes, mfiRes, activeRes] = await Promise.all([
        client.query("SELECT COUNT(*)::int AS c FROM senteloans_institutions"),
        client.query("SELECT id, name, type, status, created_at FROM senteloans_institutions ORDER BY created_at DESC LIMIT 3"),
        client.query("SELECT COUNT(*)::int AS c FROM senteloans_users"),
        client.query("SELECT id FROM senteloans_institutions WHERE status = 'Suspended'"),
        client.query("SELECT COUNT(*)::int AS c FROM senteloans_institutions WHERE type = 'SACCO'"),
        client.query("SELECT COUNT(*)::int AS c FROM senteloans_institutions WHERE type = 'Money Lender'"),
        client.query("SELECT COUNT(*)::int AS c FROM senteloans_institutions WHERE type = 'MFI'"),
        client.query("SELECT COUNT(*)::int AS c FROM senteloans_institutions WHERE status = 'Active'"),
      ])
      return {
        institutionsCount: instRes.rows[0]?.c ?? 0,
        recentInstitutions: recentRes.rows,
        totalUsers: usersRes.rows[0]?.c ?? 0,
        pendingInstitutions: suspendedRes.rows.length,
        saccoCount: saccoRes.rows[0]?.c ?? 0,
        moneyLenderCount: mlRes.rows[0]?.c ?? 0,
        mfiCount: mfiRes.rows[0]?.c ?? 0,
        activeInstitutions: activeRes.rows[0]?.c ?? 0,
      }
    })
    return NextResponse.json(stats)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
