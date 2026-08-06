import type { PoolClient } from "pg"
import { normalizeRole } from "@/lib/api/rbac"

export const VALID_STAFF_STATUSES = ["Active", "Inactive", "Suspended"] as const

export const ROLE_NAME_TO_APP_ROLE_SQL = `CASE
  WHEN a.user_type = 'system_admin' THEN 'system_admin'
  WHEN r.name = 'System Admin' THEN 'system_admin'
  WHEN r.name = 'Super Admin' THEN 'super_admin'
  WHEN r.name = 'Admin' THEN 'institution_admin'
  WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
  ELSE NULL
END`

export type StaffRoleRow = { id: string; app_role: string }

export async function resolveRoleById(
  client: PoolClient,
  roleId: string,
): Promise<StaffRoleRow | null> {
  const roleRes = await client.query(
    `SELECT
       r.id,
       ${ROLE_NAME_TO_APP_ROLE_SQL} AS app_role
     FROM roles r
     WHERE r.id = $1
     LIMIT 1`,
    [roleId],
  )
  return (roleRes.rows[0] as StaffRoleRow | undefined) || null
}

export function canAssignRole(actorRole: string | null, targetAppRole: string): boolean {
  const actor = normalizeRole(actorRole)
  if (targetAppRole === "system_admin") return false
  if (actor !== "super_admin" && targetAppRole === "super_admin") return false
  if (actor !== "super_admin" && actor !== "institution_admin" && targetAppRole === "institution_admin") {
    return false
  }
  return true
}

/** Accepts `roleId` or legacy `roles[0]` from the staff form. */
export function parseStaffRoleId(body: { roleId?: unknown; roles?: unknown }): string | null {
  if (typeof body.roleId === "string" && body.roleId.trim()) return body.roleId.trim()
  if (Array.isArray(body.roles) && body.roles[0]) return String(body.roles[0]).trim()
  return null
}

export function parseJoinedAt(joinDate: string): string | null {
  const trimmed = joinDate.trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  return trimmed
}
