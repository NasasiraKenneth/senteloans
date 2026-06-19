import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

/**
 * GET /api/admin/users
 * Returns all staff users (users) with institution name, for system admin.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rows = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `SELECT u.id, u.full_name, u.email, u.phone_number, u.status, u.created_at,
                CASE
                  WHEN r.name = 'System Admin' THEN 'system_admin'
                  WHEN r.name = 'Super Admin' THEN 'super_admin'
                  WHEN r.name = 'Admin' THEN 'institution_admin'
                  WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
                  ELSE NULL
                END AS role,
                i.name AS institution_name, i.id AS institution_id
         FROM users u
         JOIN institutions i ON i.id = u.institution_id
         LEFT JOIN roles r ON r.id = u.role_id
         ORDER BY i.name, role, u.full_name`
      )
      return res.rows
    })

    return NextResponse.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        phoneNumber: r.phone_number,
        role: r.role,
        status: r.status,
        createdAt: r.created_at,
        institutionName: r.institution_name,
        institutionId: r.institution_id,
      }))
    )
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
