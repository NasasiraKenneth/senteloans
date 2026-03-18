import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import * as crypto from "crypto"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

const VALID_STATUSES = ["Active", "Inactive", "Suspended"]

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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
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
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

async function resolveRoleById(client: any, roleId: string): Promise<{ id: string; app_role: string } | null> {
  const roleRes = await client.query(
    `SELECT
       r.id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS app_role
     FROM senteloans_roles r
     WHERE r.id = $1
     LIMIT 1`,
    [roleId]
  )
  return roleRes.rows[0] || null
}

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get("search") || "").trim()
    const role = (searchParams.get("role") || "").trim()
    const status = (searchParams.get("status") || "").trim()
    const branchesRaw = (searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const pageSize = Math.min(
      parseInt(searchParams.get("limit") || "50", 10) || 50,
      200
    )

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        const actor = await resolveActorContext(client, session.user.authUserId as string)
        if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
        const allowed = await hasPermission(client, actor, "view_users")
        if (!allowed) return { error: "missing_permission:view_users" as const }
        const actorRole = String(actor.role || "").trim().toLowerCase()
        if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

        let where = "u.institution_id = $1"
        // Exclude system admins; list institution staff only
        where += " AND app_role.app_role != 'system_admin'"
        const params: unknown[] = [actor.institution_id]
        let idx = 2

        // Branch-scoped for non-super-admin; super_admin can view all institution branches.
        if (actorRole !== "super_admin") {
          where += ` AND u.branch_id = $${idx}`
          params.push(actor.branch_id)
          idx++
        }

        if (search) {
          where += ` AND (u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone_number ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }
        if (role) {
          where += ` AND (app_role.app_role = $${idx} OR u.role_id::text = $${idx})`
          params.push(role)
          idx++
        }
        if (status) {
          where += ` AND u.status = $${idx}`
          params.push(status)
          idx++
        }
        if (selectedBranchIds.length > 0 && actorRole === "super_admin") {
          where += ` AND u.branch_id = ANY($${idx}::uuid[])`
          params.push(selectedBranchIds)
          idx++
        }

        params.push(pageSize)
        const res = await client.query(
          `SELECT
              u.id,
              u.full_name,
              u.email,
              u.phone_number,
              app_role.app_role AS role,
              u.status,
              u.joined_at,
              u.last_login,
              u.created_at
           FROM senteloans_users u
           LEFT JOIN LATERAL (
             SELECT CASE
               WHEN r.name = 'System Admin' THEN 'system_admin'
               WHEN r.name = 'Super Admin' THEN 'super_admin'
               WHEN r.name = 'Admin' THEN 'institution_admin'
               WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
               ELSE NULL
             END AS app_role
             FROM senteloans_roles r
             WHERE r.id = u.role_id
           ) app_role ON TRUE
           WHERE ${where}
           ORDER BY u.created_at DESC
           LIMIT $${idx}`,
          params
        )
        return { staff: res.rows }
      }
    )

    if (result && "error" in result) {
      const status = result.error === "no_app_user_profile" ? 403 : 403
      apiLog("warn", "staff.list.denied", {
        method: "GET",
        apiPath,
        status,
        error: result.error,
        authUserId: session.user.authUserId,
      })
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({ staff: result?.staff || [] })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId){
      apiLog("warn", "staff.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff"){
      apiLog("warn", "staff.list.denied", { method: "GET", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const firstName = String(body.firstName || "").trim()
    const lastName = String(body.lastName || "").trim()
    const email = String(body.email || "").trim().toLowerCase()
    const phoneNumber = String(body.phoneNumber || "").trim()
    const username = String(body.username || "").trim().toLowerCase()
    const password = String(body.password || "").trim()
    const status = String(body.status || "Active").trim()
    const roles: string[] = Array.isArray(body.roles) ? body.roles : []

    // Validation
    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 })
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 })
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })
    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 })
    if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    if (roles.length === 0) return NextResponse.json({ error: "At least one role is required" }, { status: 400 })

    // Use the first role as the primary role (DB column is single enum)
    const selectedRoleId = roles[0]
    if (!VALID_STATUSES.includes(status))
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })

    const fullName = `${firstName} ${lastName}`

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const allowed = await hasPermission(client, actor, "create_user")
      if (!allowed) return { error: "missing_permission:create_user" as const }

      // Check email uniqueness
      const emailCheck = await client.query(
        `SELECT id FROM senteloans_users WHERE email = $1`,
        [email]
      )
      if (emailCheck.rows.length > 0)
        return { error: "email_already_exists" as const }

      // Check username uniqueness in app_auth_users
      const usernameCheck = await client.query(
        `SELECT id FROM app_auth_users WHERE username = $1 OR email = $2`,
        [username, email]
      )
      if (usernameCheck.rows.length > 0)
        return { error: "username_or_auth_email_already_exists" as const }

      // 1. Create app_auth_users record
      const passwordHash = await hash(password, 10)
      const authId = crypto.randomUUID()
      await client.query(
        `INSERT INTO app_auth_users (id, email, password_hash, username)
         VALUES ($1, $2, $3, $4)`,
        [authId, email, passwordHash, username]
      )

      // 2. Resolve role_id from normalized role name
      const roleRow = await resolveRoleById(client, selectedRoleId)
      if (!roleRow?.id) return { error: "role_not_found" as const }
      if (roleRow.app_role === "system_admin") return { error: "invalid_role_for_institution_staff" as const }
      if (actor.role !== "super_admin" && roleRow.app_role === "super_admin") {
        return { error: "insufficient_role_scope_for_assignment" as const }
      }
      if (actor.role !== "super_admin" && actor.role !== "institution_admin" && roleRow.app_role === "institution_admin") {
        return { error: "insufficient_role_scope_for_assignment" as const }
      }

      // 3. Create senteloans_users record
      const userId = crypto.randomUUID()
      await client.query(
        `INSERT INTO senteloans_users (
          id, supabase_user_id, institution_id, branch_id, role_id, email, full_name, phone_number,
          status, joined_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          authId,
          actor.institution_id,
          actor.branch_id,
          roleRow.id,
          email,
          fullName,
          phoneNumber || null,
          status,
          null,
        ]
      )

      // 4. Audit log
      await auditLogger.logInsert(
        "senteloans_users",
        userId,
        { email, full_name: fullName, role: roleRow.app_role, status, role_id: roleRow.id },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )

      return {
        ok: true,
        staff: {
          id: userId,
          full_name: fullName,
          email,
          phone_number: phoneNumber || null,
          role: roleRow.app_role,
          status,
          joined_at: null,
          created_at: new Date().toISOString(),
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "email_already_exists" ? 409 :
        result.error === "username_or_auth_email_already_exists" ? 409 :
        result.error === "role_not_found" ? 400 :
        result.error === "invalid_role_for_institution_staff" ? 400 :
        result.error === "insufficient_role_scope_for_assignment" ? 403 :
        result.error === "missing_permission:create_user" ? 403 :
        result.error === "actor_branch_missing" ? 400 :
        result.error === "user_not_linked" ? 400 : 500
      const message =
        result.error === "email_already_exists" ? "A staff member with this email already exists" :
        result.error === "username_or_auth_email_already_exists" ? "Username or email is already taken" :
        result.error === "role_not_found" ? "Selected role is not available in role catalog" :
        result.error === "invalid_role_for_institution_staff" ? "System Admin cannot be assigned as institution staff role" :
        result.error === "insufficient_role_scope_for_assignment" ? "You are not allowed to assign the selected role" :
        result.error === "missing_permission:create_user" ? "missing_permission:create_user" :
        result.error === "actor_branch_missing" ? "Current staff user has no branch configured" :
        result.error
      return NextResponse.json({ error: message }, { status: statusCode })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    )
  }
}
