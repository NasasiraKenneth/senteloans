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
     WHERE u.supabase_user_id = $1
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

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "clients.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "clients.list.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get("search") || "").trim()
    const status = (searchParams.get("status") || "").trim()
    const branchesRaw = (searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const pageSize = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_clients")
      if (!allowed) return { error: "missing_permission:view_clients" as const }
      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      let where = "c.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2

      if (actorRole !== "super_admin") {
        where += ` AND c.branch_id = $${idx}`
        params.push(actor.branch_id)
        idx++
      }
      if (search) {
        where += ` AND (c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone ILIKE $${idx})`
        params.push(`%${search}%`)
        idx++
      }
      if (status) {
        where += ` AND c.status = $${idx}`
        params.push(status)
        idx++
      }
      if (selectedBranchIds.length > 0 && actorRole === "super_admin") {
        where += ` AND c.branch_id = ANY($${idx}::uuid[])`
        params.push(selectedBranchIds)
        idx++
      }

      params.push(pageSize)
      const listRes = await client.query(
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
         FROM clients c
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN users cu ON cu.id = c.created_by
         LEFT JOIN users mu ON mu.id = c.modified_by
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT $${idx}`,
        params
      )
      return { clients: listRes.rows }
    })

    if (result && "error" in result) {
      const statusCode = result.error === "actor_branch_missing" ? 400 : 403
      apiLog("warn", "clients.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    apiLog("info", "clients.list.success", { method: "GET", apiPath, status: 200, count: result?.clients?.length || 0, authUserId: session.user.authUserId })
    return NextResponse.json({ clients: result?.clients || [] })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "clients.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "clients.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "clients.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const name = String(body.name || "").trim()
    const status = String(body.status || "Active").trim()
    const emailRaw = String(body.email || "").trim()
    const address = String(body.address || "").trim()
    const phone = String(body.phone || "").trim()

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
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const allowed = await hasPermission(client, actor, "create_client")
      if (!allowed) return { error: "missing_permission:create_client" as const }

      const insertRes = await client.query(
        `INSERT INTO clients (
           institution_id, branch_id, name, status, email, address, phone, created_by, modified_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING id, institution_id, branch_id, name, status, email, address, phone, created_by, created_at, modified_by, updated_at`,
        [
          actor.institution_id,
          actor.branch_id,
          name,
          status,
          email,
          address || null,
          phone || null,
          actor.id,
        ]
      )
      const inserted = insertRes.rows[0]
      if (inserted?.id) {
        await auditLogger.logInsert(
          "clients",
          inserted.id,
          {
            name: inserted.name,
            status: inserted.status,
            email: inserted.email,
            address: inserted.address,
            phone: inserted.phone,
          },
          actor.institution_id,
          actor.id,
          undefined,
          client
        )
      }
      return { client: inserted }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "actor_branch_missing" ? 400 :
        errorCode.startsWith("missing_permission:") ? 403 : 400
      apiLog("warn", "clients.create.denied", { method: "POST", apiPath, status: statusCode, error: errorCode, authUserId: session.user.authUserId })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "clients.create.success", { method: "POST", apiPath, status: 201, authUserId: session.user.authUserId, clientId: result?.client?.id })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "clients.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
