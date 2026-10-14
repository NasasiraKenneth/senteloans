import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { hasPermissions } from "@/lib/api/rbac"

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
         WHEN r.name = 'System Admin' THEN 'system_admin'\n         WHEN r.name = 'Super Admin' THEN 'super_admin'\n         WHEN r.name = 'Admin' THEN 'institution_admin'\n         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')\n         ELSE NULL\n       END AS role\n     FROM users u\n     LEFT JOIN roles r ON r.id = u.role_id\n     WHERE u.auth_id = $1\n     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "transactions.permissions.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "transactions.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const permissions = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return null
      const role = String(actor.role || "").trim().toLowerCase()

      const perms = await hasPermissions(client, actor, ["view_transactions", "create_transaction"] as const)
      const viewTransactions = perms.view_transactions
      const createTransaction = perms.create_transaction

      const branches =
        role === "super_admin"
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

      return {
        viewTransactions,
        createTransaction,
        isSuperAdmin: role === "super_admin",
        branches,
      }
    })

    if (!permissions) {
      apiLog("warn", "transactions.permissions.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }
    apiLog("info", "transactions.permissions.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId })
    return NextResponse.json({ permissions })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "transactions.permissions.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
