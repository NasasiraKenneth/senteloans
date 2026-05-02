/**
 * Shared actor resolution and permission checks for /api/institution/investments routes.
 * Permission names must match scripts/09-seed-users.sql (senteloans_permissions).
 */

export type InvestmentActor = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

export async function resolveInvestmentActor(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: InvestmentActor[] }> },
  authUserId: string,
): Promise<InvestmentActor | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId],
  )
  return actorRes.rows[0] || null
}

export async function hasInvestmentPermission(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> },
  actor: InvestmentActor,
  permission: string,
): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  )
  return (permRes.rowCount ?? 0) > 0
}
