import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
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
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.auth_id = $1
     LIMIT 1`,
    [authUserId],
  )
  return actorRes.rows[0] || null
}

/**
 * Reserved for when branch RBAC is re-enabled on this route.
 * @see `canManageRolePermissions` — permission checks are commented out for now.
 */
async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
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
  return permRes.rowCount > 0
}

const EXCLUDED_ROLE_NAMES = ["Super Admin", "System Admin"]

async function canManageRolePermissions(client: any, actor: ActorContext): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin" || role === "system_admin" || role === "institution_admin") return true
  return hasPermission(client, actor, "edit_role_permissions")
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "institution.role_permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "institution.role_permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const payload = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.branch_id) return { error: "no_branch" as const }
      const allowed = await canManageRolePermissions(client, actor)
      if (!allowed) return { error: "forbidden" as const }

      const branchRes = await client.query(`SELECT id, name FROM branches WHERE id = $1 LIMIT 1`, [actor.branch_id])
      const branch = branchRes.rows[0] || { id: actor.branch_id, name: "Branch" }

      const rolesRes = await client.query(
        `SELECT id, name, description
         FROM roles
         WHERE name <> ALL($1::text[])
         ORDER BY name ASC`,
        [EXCLUDED_ROLE_NAMES],
      )

      const permsRes = await client.query(
        `SELECT id, name, COALESCE(module, 'other') AS module
         FROM permissions
         ORDER BY module ASC, name ASC`,
      )

      const rpRes = await client.query(
        `SELECT role_id, permission_id
         FROM role_permissions
         WHERE branch_id = $1`,
        [actor.branch_id],
      )

      const rolePermissionIds: Record<string, string[]> = {}
      for (const row of rolesRes.rows) {
        rolePermissionIds[row.id] = []
      }
      for (const row of rpRes.rows) {
        const rid = row.role_id as string
        if (!rolePermissionIds[rid]) rolePermissionIds[rid] = []
        rolePermissionIds[rid].push(row.permission_id as string)
      }

      const actorRole = String(actor.role || "").trim().toLowerCase()

      return {
        branch: { id: branch.id, name: branch.name },
        roles: rolesRes.rows,
        permissions: permsRes.rows,
        rolePermissionIds,
        actorIsSuperAdmin: actorRole === "super_admin",
      }
    })

    if (!payload) {
      apiLog("warn", "institution.role_permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }
    if ("error" in payload) {
      const status = payload.error === "forbidden" ? 403 : 400
      apiLog("warn", "institution.role_permissions.denied", { method: "GET", apiPath, status, error: payload.error })
      return NextResponse.json({ error: payload.error }, { status })
    }

    apiLog("info", "institution.role_permissions.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.role_permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "institution.role_permissions.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "institution.role_permissions.denied", { method: "PUT", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = (await req.json()) as { roleId?: string; permissionIds?: unknown }
    const roleId = typeof body.roleId === "string" ? body.roleId.trim() : ""
    const rawIds = Array.isArray(body.permissionIds) ? body.permissionIds : []
    const permissionIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))]

    if (!roleId) {
      return NextResponse.json({ error: "role_id_required" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.branch_id) return { error: "no_branch" as const }
      const allowed = await canManageRolePermissions(client, actor)
      if (!allowed) return { error: "forbidden" as const }

      const roleRes = await client.query(
        `SELECT id, name FROM roles WHERE id = $1 AND name <> ALL($2::text[]) LIMIT 1`,
        [roleId, EXCLUDED_ROLE_NAMES],
      )
      const targetRole = roleRes.rows[0]
      if (!targetRole) return { error: "invalid_role" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      const isSuperAdminActor = actorRole === "super_admin"

      if (permissionIds.length > 0) {
        const validRes = await client.query(
          `SELECT id FROM permissions WHERE id = ANY($1::uuid[])`,
          [permissionIds],
        )
        if (validRes.rows.length !== permissionIds.length) {
          return { error: "invalid_permission_ids" as const }
        }
      }

      let finalIds = [...permissionIds]
      if (targetRole.name === "Admin" && !isSuperAdminActor) {
        const erpRes = await client.query(`SELECT id FROM permissions WHERE name = 'edit_role_permissions' LIMIT 1`)
        const erpId = erpRes.rows[0]?.id as string | undefined
        if (erpId && !finalIds.includes(erpId)) {
          finalIds.push(erpId)
        }
      }

      await client.query("BEGIN")
      try {
        await client.query(`DELETE FROM role_permissions WHERE branch_id = $1 AND role_id = $2`, [actor.branch_id, roleId])
        if (finalIds.length > 0) {
          await client.query(
            `INSERT INTO role_permissions (branch_id, role_id, permission_id)
             SELECT $1, $2, unnest($3::uuid[])`,
            [actor.branch_id, roleId, finalIds],
          )
        }
        await client.query("COMMIT")
      } catch (e) {
        await client.query("ROLLBACK")
        throw e
      }

      const rpRes = await client.query(
        `SELECT permission_id FROM role_permissions WHERE branch_id = $1 AND role_id = $2`,
        [actor.branch_id, roleId],
      )
      return { permissionIds: rpRes.rows.map((r: { permission_id: string }) => r.permission_id) }
    })

    if (!result) {
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }
    if ("error" in result) {
      const map: Record<string, number> = {
        forbidden: 403,
        no_branch: 400,
        invalid_role: 400,
        invalid_permission_ids: 400,
      }
      const status = map[result.error] || 400
      apiLog("warn", "institution.role_permissions.denied", { method: "PUT", apiPath, status, error: result.error })
      return NextResponse.json({ error: result.error }, { status })
    }

    apiLog("info", "institution.role_permissions.updated", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "institution.role_permissions.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
