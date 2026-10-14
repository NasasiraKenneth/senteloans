import { compare } from "bcryptjs"
import type { PoolClient } from "pg"
import { LOGIN_ERROR_MESSAGES, type LoginContext } from "@/lib/auth-login-messages"
import type { AppSessionUser } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

export class AuthLoginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthLoginError"
  }
}

async function recordStaffLastLogin(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1`,
    [userId],
  )
}

async function authenticateWithClient(
  client: PoolClient,
  email: string,
  password: string,
  loginContext?: LoginContext | "admin",
): Promise<AppSessionUser | null> {
  const authRes = await client.query<{ id: string; password_hash: string; user_type: string }>(
    `SELECT id, password_hash, user_type FROM app_auth_users WHERE email = $1`,
    [email],
  )
  const authRow = authRes.rows[0]
  if (!authRow || !(await compare(password, authRow.password_hash))) return null

  const authUserId = authRow.id

  // Query both staff and member profiles linked to this auth identity
  const [staffRes, memberRes] = await Promise.all([
    client.query<{
      id: string
      full_name: string
      role: string | null
      institution_id: string
      branch_status: string | null
    }>(
      `SELECT
         u.id,
         u.full_name,
         u.institution_id,
         b.status::text AS branch_status,
         CASE
           WHEN a.user_type = 'system_admin' THEN 'system_admin'
           WHEN r.name = 'System Admin' THEN 'system_admin'
           WHEN r.name = 'Super Admin' THEN 'super_admin'
           WHEN r.name = 'Admin' THEN 'institution_admin'
           WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
           ELSE NULL
         END AS role
       FROM users u
       LEFT JOIN app_auth_users a ON a.id = u.auth_id
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.auth_id = $1 AND u.status = 'Active'`,
      [authUserId],
    ),
    client.query<{
      id: string
      full_name: string
      institution_id: string
      branch_status: string | null
    }>(
      `SELECT m.id, m.full_name, m.institution_id, b.status::text AS branch_status
         FROM members m
         LEFT JOIN branches b ON b.id = m.branch_id
        WHERE m.auth_id = $1 AND m.status = 'Active'`,
      [authUserId],
    ),
  ])

  const staff = staffRes.rows[0] || null
  const memberRow = memberRes.rows[0] || null
  const isSystemAdmin = authRow.user_type === "system_admin" || staff?.role === "system_admin"

  const availableRoles: Array<"staff" | "client" | "system_admin"> = []
  if (isSystemAdmin) availableRoles.push("system_admin")
  if (staff) availableRoles.push("staff")
  if (memberRow) availableRoles.push("client")

  if (availableRoles.length === 0) {
    return null
  }

  // Determine active initial role based on loginContext or default precedence
  let activeRole: "staff" | "client" | "system_admin"

  if (loginContext === "client") {
    if (!availableRoles.includes("client")) {
      throw new AuthLoginError(LOGIN_ERROR_MESSAGES.useStaffLogin)
    }
    if (memberRow?.branch_status && memberRow.branch_status !== "Active") {
      throw new AuthLoginError(LOGIN_ERROR_MESSAGES.branchInactive)
    }
    activeRole = "client"
  } else if (loginContext === "institution") {
    if (!availableRoles.includes("staff") && !availableRoles.includes("system_admin")) {
      throw new AuthLoginError(LOGIN_ERROR_MESSAGES.useClientLogin)
    }
    if (staff?.branch_status && staff.branch_status !== "Active") {
      throw new AuthLoginError(LOGIN_ERROR_MESSAGES.branchInactive)
    }
    activeRole = isSystemAdmin && !staff ? "system_admin" : "staff"
  } else if (loginContext === "admin") {
    if (!availableRoles.includes("system_admin")) {
      throw new AuthLoginError("Not authorized for admin portal")
    }
    activeRole = "system_admin"
  } else {
    // Unified login: default to staff if available, else client, else system_admin
    activeRole = staff ? "staff" : memberRow ? "client" : "system_admin"
  }

  if (staff && (activeRole === "staff" || activeRole === "system_admin")) {
    await recordStaffLastLogin(client, staff.id)
  }

  const isClient = activeRole === "client"

  return {
    id: authUserId,
    authUserId,
    email,
    name: (isClient ? memberRow?.full_name : staff?.full_name) || memberRow?.full_name || staff?.full_name || "User",
    role: activeRole === "system_admin" ? "system_admin" : (isClient ? "client" : (staff?.role ?? "")),
    type: isClient ? "client" : "staff",
    activeRole,
    availableRoles,
    institutionId: staff?.institution_id || memberRow?.institution_id,
    userId: staff?.id,
    memberId: memberRow?.id,
    clientId: memberRow?.id,
  }
}

export async function authenticateCredentials(
  email: string,
  password: string,
  loginContext?: LoginContext | "admin",
): Promise<AppSessionUser | null> {
  return runWithoutAuth((client) => authenticateWithClient(client, email, password, loginContext))
}
