import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import {
  AUTH_USER_TYPE_INSTITUTION_STAFF,
  AUTH_USER_TYPE_HYBRID,
  getUniqueUsername,
} from "@/lib/auth-users"
import * as crypto from "crypto"
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
        const actor = await resolveActorContext(client, session.user.authUserId as string, {
          activeOnly: false,
        })
        if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
        const allowed = await hasPermission(client, actor, "view_users")
        if (!allowed) return { error: "missing_permission:view_users" as const }
        if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

        let where = "u.institution_id = $1"
        where += " AND app_role.app_role != 'system_admin'"
        const params: unknown[] = [actor.institution_id]
        let idx = 2

        if (!isSuperAdmin(actor)) {
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
        if (selectedBranchIds.length > 0 && isSuperAdmin(actor)) {
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
              b.name AS branch_name,
              app_role.app_role AS role,
              u.status,
              u.joined_at,
              u.last_login,
              u.created_at
           FROM users u
           LEFT JOIN branches b ON b.id = u.branch_id
           LEFT JOIN LATERAL (
             SELECT CASE
               WHEN r.name = 'System Admin' THEN 'system_admin'
               WHEN r.name = 'Super Admin' THEN 'super_admin'
               WHEN r.name = 'Admin' THEN 'institution_admin'
               WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
               ELSE NULL
             END AS app_role
             FROM roles r
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
    const rawUsername = String(body.username || "").trim().toLowerCase()
    const password = String(body.password || "").trim()
    const status = String(body.status || "Active").trim()
    const joinDate = String(body.joinDate || "").trim()
    const selectedRoleId = parseStaffRoleId(body)

    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 })
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 })
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })
    if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
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
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }
      const allowed = await hasPermission(client, actor, "create_user")
      if (!allowed) return { error: "missing_permission:create_user" as const }

      // 1. Ensure email is unique in the users table
      const emailCheck = await client.query(
        `SELECT id FROM users WHERE lower(email) = $1`,
        [email]
      )
      if (emailCheck.rows.length > 0)
        return { error: "email_already_exists" as const }

      // 2. Check if an account with this email already exists in app_auth_users
      const existingEmailAuthRes = await client.query<{ id: string; user_type: string; username: string }>(
        `SELECT id, user_type, username FROM app_auth_users WHERE lower(email) = $1 LIMIT 1`,
        [email]
      )
      const existingAuth = existingEmailAuthRes.rows[0]

      let authId: string
      const passwordHash = await hash(password, 10)

      if (existingAuth) {
        // If an auth record exists with this email:
        // Use existing auth username, or auto-generate if missing; if rawUsername was explicitly passed, respect it
        const targetUsername =
          rawUsername ||
          existingAuth.username ||
          (await getUniqueUsername(client, email, existingAuth.id))

        const usernameCheck = await client.query(
          `SELECT id FROM app_auth_users WHERE lower(username) = $1 AND id <> $2 LIMIT 1`,
          [targetUsername, existingAuth.id]
        )
        if (usernameCheck.rows.length > 0) {
          return { error: "username_already_exists" as const }
        }

        authId = existingAuth.id

        // Check if there is a member record linked to this auth_id or email
        const memberRes = await client.query<{ id: string; status: string }>(
          `SELECT id, status FROM members WHERE auth_id = $1 OR lower(email) = $2 LIMIT 1`,
          [existingAuth.id, email]
        )
        const memberRow = memberRes.rows[0]
        const isMemberActive = Boolean(memberRow && String(memberRow.status).toLowerCase() === "active")
        const targetUserType = isMemberActive ? AUTH_USER_TYPE_HYBRID : AUTH_USER_TYPE_INSTITUTION_STAFF

        // Update auth user: elevate to hybrid if active member, update password hash and username
        await client.query(
          `UPDATE app_auth_users
           SET user_type = $1, username = $2, password_hash = $3, updated_at = NOW()
           WHERE id = $4`,
          [targetUserType, targetUsername, passwordHash, existingAuth.id]
        )

        // Ensure member record is linked to this auth_id if it had no auth_id yet
        if (memberRow) {
          await client.query(
            `UPDATE members SET auth_id = $1 WHERE id = $2 AND auth_id IS NULL`,
            [existingAuth.id, memberRow.id]
          )
        }
      } else {
        // No account in app_auth_users with this email:
        // Auto-generate unique username (or use rawUsername if provided)
        const targetUsername = rawUsername || (await getUniqueUsername(client, email))
        const usernameCheck = await client.query(
          `SELECT id FROM app_auth_users WHERE lower(username) = $1 LIMIT 1`,
          [targetUsername]
        )
        if (usernameCheck.rows.length > 0) {
          return { error: "username_already_exists" as const }
        }

        // Check if an existing member record has this email
        const memberRes = await client.query<{ id: string; status: string }>(
          `SELECT id, status FROM members WHERE lower(email) = $1 LIMIT 1`,
          [email]
        )
        const memberRow = memberRes.rows[0]
        const isMemberActive = Boolean(memberRow && String(memberRow.status).toLowerCase() === "active")
        const targetUserType = isMemberActive ? AUTH_USER_TYPE_HYBRID : AUTH_USER_TYPE_INSTITUTION_STAFF

        authId = crypto.randomUUID()
        await client.query(
          `INSERT INTO app_auth_users (id, user_type, username, email, password_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [authId, targetUserType, targetUsername, email, passwordHash]
        )

        // If a member record with this email exists, link it to this authId
        if (memberRow) {
          await client.query(
            `UPDATE members SET auth_id = $1 WHERE id = $2 AND auth_id IS NULL`,
            [authId, memberRow.id]
          )
        }
      }

      const roleRow = await resolveRoleById(client, selectedRoleId)
      if (!roleRow?.id) return { error: "role_not_found" as const }
      if (roleRow.app_role === "system_admin") return { error: "invalid_role_for_institution_staff" as const }
      if (!canAssignRole(actor.role, roleRow.app_role)) {
        return { error: "insufficient_role_scope_for_assignment" as const }
      }

      const userId = crypto.randomUUID()
      await client.query(
        `INSERT INTO users (
          id, auth_id, institution_id, branch_id, role_id, email, full_name, phone_number,
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
          joinedAt,
        ]
      )

      await auditLogger.logInsert(
        "users",
        userId,
        { email, full_name: fullName, role: roleRow.app_role, status, role_id: roleRow.id, joined_at: joinedAt },
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
          joined_at: joinedAt,
          created_at: new Date().toISOString(),
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === SUPER_ADMIN_WRITE_BLOCKED ? 403 :
        result.error === "email_already_exists" ? 409 :
        result.error === "username_already_exists" ? 409 :
        result.error === "username_or_auth_email_already_exists" ? 409 :
        result.error === "role_not_found" ? 400 :
        result.error === "invalid_role_for_institution_staff" ? 400 :
        result.error === "insufficient_role_scope_for_assignment" ? 403 :
        result.error === "missing_permission:create_user" ? 403 :
        result.error === "actor_branch_missing" ? 400 :
        result.error === "user_not_linked" ? 400 : 500
      const message =
        "message" in result && result.message ? result.message :
        result.error === "email_already_exists" ? "A staff member with this email already exists" :
        result.error === "username_already_exists" ? "Username is already taken" :
        result.error === "username_or_auth_email_already_exists" ? "Username or email is already taken" :
        result.error === "role_not_found" ? "Selected role is not available in role catalog" :
        result.error === "invalid_role_for_institution_staff" ? "System Admin cannot be assigned as institution staff role" :
        result.error === "insufficient_role_scope_for_assignment" ? "You are not allowed to assign the selected role" :
        result.error === "missing_permission:create_user" ? "missing_permission:create_user" :
        result.error === "actor_branch_missing" ? "Current staff user has no branch configured" :
        result.error
      return NextResponse.json({ error: message, code: result.error }, { status: statusCode })
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
