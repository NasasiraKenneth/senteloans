import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

function isElevated(role?: string | null) {
  return role === "super_admin" || role === "institution_admin" || role === "manager"
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "staff.roles.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "staff.roles.denied", { method: "GET", apiPath, status: 403, error: "forbidden" })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!isElevated(session.user.role)) {
      apiLog("warn", "staff.roles.denied", { method: "GET", apiPath, status: 403, error: "insufficient_role_scope" })
      return NextResponse.json({ error: "Only admins and managers can view role options" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT
           CASE
             WHEN r.name = 'System Admin' THEN 'system_admin'
             WHEN r.name = 'Super Admin' THEN 'super_admin'
             WHEN r.name = 'Admin' THEN 'institution_admin'
             WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
             ELSE NULL
           END AS actor_role
         FROM senteloans_users u
         LEFT JOIN senteloans_roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1
         LIMIT 1`,
        [session.user.authUserId]
      )
      const actorRole: string | null = actorRes.rows[0]?.actor_role || null

      const rolesRes = await client.query(
        `SELECT
           r.id,
           r.name,
           CASE
             WHEN r.name = 'System Admin' THEN 'system_admin'
             WHEN r.name = 'Super Admin' THEN 'super_admin'
             WHEN r.name = 'Admin' THEN 'institution_admin'
             WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
             ELSE NULL
           END AS value
         FROM senteloans_roles r
         WHERE r.name IS NOT NULL
         ORDER BY r.name ASC`
      )
      const roles = rolesRes.rows
        .map((r: { id: string; name: string; value: string | null }) => ({ label: r.name, value: r.id, appRole: r.value }))
        .filter((r: { label: string; value: string; appRole: string | null }) => {
          if (!r.appRole || r.appRole === "system_admin") return false
          if (actorRole === "super_admin") return true
          if (actorRole === "institution_admin") return r.appRole !== "super_admin"
          return r.appRole !== "super_admin" && r.appRole !== "institution_admin"
        })
        .map((r: { label: string; value: string }) => ({ label: r.label, value: r.value }))
      return roles
    })

    apiLog("info", "staff.roles.success", { method: "GET", apiPath, status: 200, count: Array.isArray(result) ? result.length : 0, authUserId: session.user.authUserId })
    return NextResponse.json({ roles: result })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "staff.roles.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
