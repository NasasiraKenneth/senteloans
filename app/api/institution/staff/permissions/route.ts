import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermission, isSuperAdmin, normalizeRole, resolveActorContext } from "@/lib/api/rbac"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "staff.permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "staff.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor) return null
      const role = normalizeRole(actor.role)

      const [viewUsers, createUser, editUser, hasEditRolePerm] = await Promise.all([
        hasPermission(client, actor, "view_users"),
        hasPermission(client, actor, "create_user"),
        hasPermission(client, actor, "edit_user"),
        hasPermission(client, actor, "edit_role_permissions"),
      ])
      const editRolePermissions =
        role === "super_admin" ||
        role === "system_admin" ||
        role === "institution_admin" ||
        hasEditRolePerm

      const branches =
        isSuperAdmin(actor)
          ? (
              await client.query(
                `SELECT id, name
                 FROM branches
                 WHERE institution_id = $1
                 ORDER BY name ASC`,
                [actor.institution_id]
              )
            ).rows
          : []

      const currentBranch =
        actor.branch_id
          ? (
              await client.query(
                `SELECT id, name
                 FROM branches
                 WHERE id = $1
                 LIMIT 1`,
                [actor.branch_id]
              )
            ).rows[0] || null
          : null

      return {
        viewUsers,
        createUser,
        editUser,
        editRolePermissions,
        isSuperAdmin: isSuperAdmin(actor),
        branches,
        currentBranch,
      }
    })

    if (!permissions) {
      apiLog("warn", "staff.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }
    apiLog("info", "staff.permissions.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "staff.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
