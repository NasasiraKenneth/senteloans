import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
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
     FROM roles r
     WHERE r.id = $1
     LIMIT 1`,
    [roleId]
  )
  return roleRes.rows[0] || null
}

/** GET /api/institution/staff/[id] — fetch a single staff member */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing staff ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "staff.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "staff.detail.denied", { method: "GET", apiPath, status: 403, error: "forbidden" })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_users")
      if (!allowed) return { error: "missing_permission:view_users" as const }
      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const whereBranchClause =
        actorRole === "super_admin" ? "" : " AND u.branch_id = $3"
      const queryParams =
        actorRole === "super_admin"
          ? [id, actor.institution_id]
          : [id, actor.institution_id, actor.branch_id]

      const res = await client.query(
        `SELECT
                u.id,
                u.full_name,
                u.email,
                u.phone_number,
                u.role_id,
                CASE
                  WHEN r.name = 'System Admin' THEN 'system_admin'
                  WHEN r.name = 'Super Admin' THEN 'super_admin'
                  WHEN r.name = 'Admin' THEN 'institution_admin'
                  WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
                  ELSE NULL
                END AS role,
                u.status,
                u.joined_at,
                u.last_login,
                u.created_at,
                a.username
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN app_auth_users a ON a.id = u.auth_id
         WHERE u.id = $1 AND u.institution_id = $2${whereBranchClause}`,
        queryParams
      )
      if (res.rows.length === 0) return { error: "staff_not_found" as const }
      return { staff: res.rows[0] }
    })

    if (result && "error" in result) {
      const status =
        result.error === "staff_not_found" ? 404 :
        result.error === "missing_permission:view_users" ? 403 :
        result.error === "actor_branch_missing" ? 400 : 400
      apiLog("warn", "staff.detail.denied", { method: "GET", apiPath, status, error: result.error, authUserId: session.user.authUserId, staffId: id })
      return NextResponse.json({ error: result.error }, { status })
    }

    apiLog("info", "staff.detail.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId, staffId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "staff.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/** PUT /api/institution/staff/[id] — update a staff member */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing staff ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "staff.update.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "staff.update.denied", { method: "PUT", apiPath, status: 403, error: "forbidden" })
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
    const joinDate = String(body.joinDate || "").trim()
    const roles: string[] = Array.isArray(body.roles) ? body.roles : []

    // Validation
    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 })
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 })
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })
    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 })
    if (roles.length === 0) return NextResponse.json({ error: "At least one role is required" }, { status: 400 })

    const selectedRoleId = roles[0]
    if (!VALID_STATUSES.includes(status))
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })

    const fullName = `${firstName} ${lastName}`

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "edit_user")
      if (!allowed) return { error: "missing_permission:edit_user" as const }
      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const whereBranchClause =
        actorRole === "super_admin" ? "" : " AND u.branch_id = $3"
      const queryParams =
        actorRole === "super_admin"
          ? [id, actor.institution_id]
          : [id, actor.institution_id, actor.branch_id]

      // Get existing staff member
      const staffRes = await client.query(
        `SELECT
           u.id,
           u.email,
           u.auth_id,
           u.full_name,
           CASE
             WHEN r.name = 'System Admin' THEN 'system_admin'
             WHEN r.name = 'Super Admin' THEN 'super_admin'
             WHEN r.name = 'Admin' THEN 'institution_admin'
             WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
             ELSE NULL
           END AS role,
           u.status,
           u.role_id
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND u.institution_id = $2${whereBranchClause}`,
        queryParams
      )
      if (staffRes.rows.length === 0) return { error: "staff_not_found" as const }
      const existing = staffRes.rows[0]

      // Check email uniqueness (exclude self)
      if (email !== existing.email) {
        const emailCheck = await client.query(
          `SELECT id FROM users WHERE email = $1 AND id != $2`,
          [email, id]
        )
        if (emailCheck.rows.length > 0) return { error: "email_already_exists" as const }
      }

      // Check username uniqueness in app_auth_users (exclude self)
      if (existing.auth_id) {
        const usernameCheck = await client.query(
          `SELECT id FROM app_auth_users WHERE (username = $1 OR email = $2) AND id != $3`,
          [username, email, existing.auth_id]
        )
        if (usernameCheck.rows.length > 0) return { error: "username_or_auth_email_already_exists" as const }
      }

      const roleRow = await resolveRoleById(client, selectedRoleId)
      if (!roleRow?.id) return { error: "role_not_found" as const }
      if (roleRow.app_role === "system_admin") return { error: "invalid_role_for_institution_staff" as const }
      if (actor.role !== "super_admin" && roleRow.app_role === "super_admin") {
        return { error: "insufficient_role_scope_for_assignment" as const }
      }
      if (actor.role !== "super_admin" && actor.role !== "institution_admin" && roleRow.app_role === "institution_admin") {
        return { error: "insufficient_role_scope_for_assignment" as const }
      }

      // Store old values for audit
      const oldValues = {
        full_name: existing.full_name,
        email: existing.email,
        role: existing.role,
        status: existing.status,
      }

      // 1. Update users
      await client.query(
        `UPDATE users
         SET full_name = $1, email = $2, phone_number = $3, role_id = $4,
             status = $5, joined_at = $6, updated_at = NOW()
         WHERE id = $7`,
        [fullName, email, phoneNumber || null, roleRow.id, status, joinDate || null, id]
      )

      // 2. Update app_auth_users (email, username, and optionally password)
      if (existing.auth_id) {
        if (password && password.length >= 8) {
          const passwordHash = await hash(password, 10)
          await client.query(
            `UPDATE app_auth_users SET email = $1, username = $2, password_hash = $3, updated_at = NOW() WHERE id = $4`,
            [email, username, passwordHash, existing.auth_id]
          )
        } else {
          await client.query(
            `UPDATE app_auth_users SET email = $1, username = $2, updated_at = NOW() WHERE id = $3`,
            [email, username, existing.auth_id]
          )
        }
      }

      // 3. Audit log
      await auditLogger.logUpdate(
        "users",
        id,
        oldValues,
        { full_name: fullName, email, role: roleRow.app_role, role_id: roleRow.id, status },
        actor.institution_id,
        actor.id,
        undefined,
        client
      )

      return {
        ok: true,
        staff: {
          id,
          full_name: fullName,
          email,
          phone_number: phoneNumber || null,
          role: roleRow.app_role,
          status,
          joined_at: joinDate || null,
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "staff_not_found" ? 404 :
        result.error === "email_already_exists" ? 409 :
        result.error === "username_or_auth_email_already_exists" ? 409 :
        result.error === "role_not_found" ? 400 :
        result.error === "invalid_role_for_institution_staff" ? 400 :
        result.error === "insufficient_role_scope_for_assignment" ? 403 :
        result.error === "missing_permission:edit_user" ? 403 :
        result.error === "actor_branch_missing" ? 400 :
        result.error === "user_not_linked" ? 400 : 500
      const message =
        result.error === "email_already_exists" ? "A staff member with this email already exists" :
        result.error === "username_or_auth_email_already_exists" ? "Username or email is already taken" :
        result.error === "role_not_found" ? "Selected role is not available in role catalog" :
        result.error === "invalid_role_for_institution_staff" ? "System Admin cannot be assigned as institution staff role" :
        result.error === "insufficient_role_scope_for_assignment" ? "You are not allowed to assign the selected role" :
        result.error === "missing_permission:edit_user" ? "missing_permission:edit_user" :
        result.error === "actor_branch_missing" ? "Current staff user has no branch configured" :
        result.error === "staff_not_found" ? "Staff member not found" :
        result.error
      apiLog("warn", "staff.update.denied", { method: "PUT", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId, staffId: id })
      return NextResponse.json({ error: message }, { status: statusCode })
    }

    apiLog("info", "staff.update.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId, staffId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "staff.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
