import { getServerSession } from "next-auth"
import type { PoolClient } from "pg"
import { authOptions } from "@/lib/auth"

export type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
  status?: string | null
}

export function normalizeRole(role: unknown): string {
  return String(role || "").trim().toLowerCase()
}

export function isSuperAdmin(actor: Pick<ActorContext, "role">): boolean {
  return normalizeRole(actor.role) === "super_admin"
}

/** Machine-readable error code returned when a super admin attempts a write. */
export const SUPER_ADMIN_WRITE_BLOCKED = "super_admin_write_blocked"

/** Human-readable message surfaced to the client (banner/toast) for the same case. */
export const SUPER_ADMIN_WRITE_BLOCKED_MESSAGE =
  "Super admins are not allowed to edit or modify data."

export type WriteGuardResult =
  | { ok: true }
  | { ok: false; status: 403; error: typeof SUPER_ADMIN_WRITE_BLOCKED; message: string }

/**
 * Guard for any write/modify endpoint: super admin is a read-only oversight role,
 * so all mutations are blocked. Call this right after `resolveActorContext` in a
 * route's write handler (POST/PUT/PATCH/DELETE).
 *
 * @example
 *   const guard = assertNotSuperAdmin(actor)
 *   if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })
 */
export function assertNotSuperAdmin(actor: Pick<ActorContext, "role">): WriteGuardResult {
  if (isSuperAdmin(actor)) {
    return {
      ok: false,
      status: 403,
      error: SUPER_ADMIN_WRITE_BLOCKED,
      message: SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
    }
  }
  return { ok: true }
}

export async function requireStaffSession(): Promise<
  | { ok: true; authUserId: string }
  | { ok: false; status: 401 | 403; error: "unauthorized" | "not_staff" | "no_app_user_profile" }
> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return { ok: false, status: 401, error: "unauthorized" }
  if (session.user.type !== "staff") return { ok: false, status: 403, error: "not_staff" }
  return { ok: true, authUserId: String(session.user.authUserId) }
}

export async function resolveActorContext(
  client: PoolClient,
  authUserId: string,
  options?: { activeOnly?: boolean },
): Promise<ActorContext | null> {
  const activeOnly = options?.activeOnly !== false
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       u.status::text AS status,
       CASE
         WHEN a.user_type = 'system_admin' THEN 'system_admin'
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM users u
     LEFT JOIN app_auth_users a ON a.id = u.auth_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
       ${activeOnly ? "AND u.status = 'Active'" : ""}
     LIMIT 1`,
    [authUserId],
  )
  return (actorRes.rows[0] as ActorContext | undefined) || null
}

export async function hasPermission(
  client: PoolClient,
  actor: Pick<ActorContext, "role" | "role_id" | "branch_id">,
  permission: string,
): Promise<boolean> {
  if (isSuperAdmin(actor)) return true
  if (!actor.role_id || !actor.branch_id) return false
  const permRes = await client.query(
    `SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return (permRes.rowCount ?? 0) > 0
}

export function scopeWhere(params: {
  tableAlias: string
  actor: Pick<ActorContext, "institution_id" | "branch_id" | "role">
  selectedBranchIds?: string[]
  startIndex?: number
}): { where: string; values: unknown[]; nextIndex: number } {
  const { tableAlias, actor, selectedBranchIds = [], startIndex = 1 } = params
  let where = `${tableAlias}.institution_id = $${startIndex}`
  const values: unknown[] = [actor.institution_id]
  let idx = startIndex + 1

  if (!isSuperAdmin(actor)) {
    where += ` AND ${tableAlias}.branch_id = $${idx}`
    values.push(actor.branch_id)
    idx++
  } else if (selectedBranchIds.length > 0) {
    where += ` AND ${tableAlias}.branch_id = ANY($${idx}::uuid[])`
    values.push(selectedBranchIds)
    idx++
  }

  return { where, values, nextIndex: idx }
}

