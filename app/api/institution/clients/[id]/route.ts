import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { auditLogger } from "@/lib/audit/audit-logger"

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
    [authUserId]
  )
  return actorRes.rows[0] || null
}

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
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

function whereScope(actor: ActorContext) {
  const actorRole = String(actor.role || "").trim().toLowerCase()
  if (actorRole === "super_admin") {
    return { clause: "c.id = $1 AND c.institution_id = $2", params: [] as unknown[] }
  }
  return { clause: "c.id = $1 AND c.institution_id = $2 AND c.branch_id = $3", params: [actor.branch_id] as unknown[] }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing client ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.detail.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_third_party_agents")
      if (!allowed) return { error: "missing_permission:view_third_party_agents" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const clientRes = await client.query(
        `SELECT
           c.id,
           c.institution_id,
           c.branch_id,
           b.name AS branch_name,
           c.name,
           c.status,
           c.email,
           c.address,
           c.phone,
           c.created_by,
           c.created_at,
           c.modified_by,
           c.updated_at,
           cu.full_name AS created_by_name,
           mu.full_name AS modified_by_name
         FROM third_party_agents c
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN users cu ON cu.id = c.created_by
         LEFT JOIN users mu ON mu.id = c.modified_by
         WHERE ${scope.clause}
         LIMIT 1`,
        [id, actor.institution_id, ...scope.params]
      )
      if (clientRes.rows.length === 0) return { error: "client_not_found" as const }
      return { client: clientRes.rows[0] }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "client_not_found" ? 404 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode.startsWith("missing_permission:") ? 403 : 400
      apiLog("warn", "third_party_agents.detail.denied", { method: "GET", apiPath, status: statusCode, error: errorCode, authUserId: session.user.authUserId, clientId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "third_party_agents.detail.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId, clientId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing client ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "third_party_agents.update.denied", { method: "PATCH", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "third_party_agents.update.denied", { method: "PATCH", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const status = typeof body.status === "string" ? body.status.trim() : ""
    const emailRaw = typeof body.email === "string" ? body.email.trim() : ""
    const address = typeof body.address === "string" ? body.address.trim() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 })
    const validStatuses = ["Active", "Inactive", "Suspended"]
    if (!validStatuses.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })

    let email: string | null = null
    if (emailRaw) {
      const normalized = emailRaw.toLowerCase()
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(normalized)) return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
      email = normalized
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "edit_client")
      if (!allowed) return { error: "missing_permission:edit_client" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }
      const scope = whereScope(actor)

      const existingRes = await client.query(
        `SELECT c.id, c.name, c.status, c.email, c.address, c.phone
         FROM third_party_agents c
         WHERE ${scope.clause}
         LIMIT 1`,
        [id, actor.institution_id, ...scope.params]
      )
      if (existingRes.rows.length === 0) return { error: "client_not_found" as const }
      const previous = existingRes.rows[0]

      const updateRes = await client.query(
        `UPDATE third_party_agents c
         SET
           name = $4,
           status = $5,
           email = $6,
           address = $7,
           phone = $8,
           modified_by = $9,
           updated_at = NOW()
         WHERE ${scope.clause}
         RETURNING
           c.id, c.institution_id, c.branch_id, c.name, c.status, c.email, c.address, c.phone,
           c.created_by, c.created_at, c.modified_by, c.updated_at`,
        [id, actor.institution_id, ...scope.params, name, status, email, address || null, phone || null, actor.id]
      )
      if (updateRes.rows.length === 0) return { error: "client_not_found" as const }
      const updated = updateRes.rows[0]
      await auditLogger.logUpdate(
        "third_party_agents",
        id,
        {
          name: previous.name,
          status: previous.status,
          email: previous.email,
          address: previous.address,
          phone: previous.phone,
        },
        {
          name: updated.name,
          status: updated.status,
          email: updated.email,
          address: updated.address,
          phone: updated.phone,
        },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )
      return { client: updated }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "client_not_found" ? 404 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode.startsWith("missing_permission:") ? 403 : 400
      apiLog("warn", "third_party_agents.update.denied", { method: "PATCH", apiPath, status: statusCode, error: errorCode, authUserId: session.user.authUserId, clientId: id })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "third_party_agents.update.success", { method: "PATCH", apiPath, status: 200, authUserId: session.user.authUserId, clientId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "third_party_agents.update.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

