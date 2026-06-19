import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import { auditLogger } from "@/lib/audit/audit-logger"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  SUPER_ADMIN_WRITE_BLOCKED,
  SUPER_ADMIN_WRITE_BLOCKED_MESSAGE,
} from "@/lib/api/rbac"
import {
  canAssignRole,
  parseJoinedAt,
  parseStaffRoleId,
  resolveRoleById,
  VALID_STAFF_STATUSES,
} from "@/lib/api/staff-roles"

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
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_users")
      if (!allowed) return { error: "missing_permission:view_users" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const whereBranchClause =
        isSuperAdmin(actor) ? "" : " AND u.branch_id = $3"
      const queryParams =
        isSuperAdmin(actor)
          ? [id, actor.institution_id]
          : [id, actor.institution_id, actor.branch_id]

      const res = await client.query(
        `SELECT
                u.id,
                u.full_name,
                u.email,
                u.phone_number,
                u.role_id,
                b.name AS branch_name,
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
         LEFT JOIN branches b ON b.id = u.branch_id
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
    const selectedRoleId = parseStaffRoleId(body)

    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 })
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 })
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })
    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 })
    if (!selectedRoleId) return NextResponse.json({ error: "A role is required" }, { status: 400 })
    if (!VALID_STAFF_STATUSES.includes(status as (typeof VALID_STAFF_STATUSES)[number]))
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })

    const fullName = `${firstName} ${lastName}`
    const joinedAt = parseJoinedAt(joinDate)

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, {
        activeOnly: false,
      })
      if (!actor) return { error: "user_not_linked" as const }
      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: SUPER_ADMIN_WRITE_BLOCKED, message: SUPER_ADMIN_WRITE_BLOCKED_MESSAGE }
      }
      const allowed = await hasPermission(client, actor, "edit_user")
      if (!allowed) return { error: "missing_permission:edit_user" as const }
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const whereBranchClause =
        isSuperAdmin(actor) ? "" : " AND u.branch_id = $3"
      const queryParams =
        isSuperAdmin(actor)
          ? [id, actor.institution_id]
          : [id, actor.institution_id, actor.branch_id]

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

      if (email !== existing.email) {
        const emailCheck = await client.query(
          `SELECT id FROM users WHERE email = $1 AND id != $2`,
          [email, id]
        )
        if (emailCheck.rows.length > 0) return { error: "email_already_exists" as const }
      }

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
      if (!canAssignRole(actor.role, roleRow.app_role)) {
        return { error: "insufficient_role_scope_for_assignment" as const }
      }

      const oldValues = {
        full_name: existing.full_name,
        email: existing.email,
        role: existing.role,
        status: existing.status,
      }

      await client.query(
        `UPDATE users
         SET full_name = $1, email = $2, phone_number = $3, role_id = $4,
             status = $5, joined_at = $6, updated_at = NOW()
         WHERE id = $7`,
        [fullName, email, phoneNumber || null, roleRow.id, status, joinedAt, id]
      )

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

      await auditLogger.logUpdate(
        "users",
        id,
        oldValues,
        { full_name: fullName, email, role: roleRow.app_role, role_id: roleRow.id, status, joined_at: joinedAt },
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
          joined_at: joinedAt,
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === SUPER_ADMIN_WRITE_BLOCKED ? 403 :
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
        "message" in result && result.message ? result.message :
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
      return NextResponse.json({ error: message, code: result.error }, { status: statusCode })
    }

    apiLog("info", "staff.update.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId, staffId: id })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "staff.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
