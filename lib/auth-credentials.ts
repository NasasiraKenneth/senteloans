import { compare } from "bcryptjs"
import type { PoolClient } from "pg"
import { AUTH_USER_TYPE_INSTITUTION_STAFF, AUTH_USER_TYPE_MEMBER } from "@/lib/auth-users"
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
  loginContext?: LoginContext,
): Promise<AppSessionUser | null> {
  const authRes = await client.query<{ id: string; password_hash: string; user_type: string }>(
    `SELECT id, password_hash, user_type FROM app_auth_users WHERE email = $1`,
    [email],
  )
  const authRow = authRes.rows[0]
  if (!authRow || !(await compare(password, authRow.password_hash))) return null

  const authUserId = authRow.id

  const staffRes = await client.query<{
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
  )
  const staff = staffRes.rows[0]

  if (staff) {
    if (loginContext === "institution") {
      if (authRow.user_type !== AUTH_USER_TYPE_INSTITUTION_STAFF && authRow.user_type !== "system_admin") {
        throw new AuthLoginError(LOGIN_ERROR_MESSAGES.invalidAccountType)
      }
      if (staff.branch_status && staff.branch_status !== "Active") {
        throw new AuthLoginError(LOGIN_ERROR_MESSAGES.branchInactive)
      }
    }
    if (loginContext === "client") {
      throw new AuthLoginError(LOGIN_ERROR_MESSAGES.useStaffLogin)
    }

    await recordStaffLastLogin(client, staff.id)

    return {
      id: authUserId,
      authUserId,
      email,
      name: staff.full_name,
      role: authRow.user_type === "system_admin" ? "system_admin" : (staff.role ?? ""),
      type: "staff",
      institutionId: staff.institution_id,
      userId: staff.id,
    }
  }

  const memberRes = await client.query<{
    id: string
    full_name: string
    branch_status: string | null
  }>(
    `SELECT m.id, m.full_name, b.status::text AS branch_status
       FROM members m
       LEFT JOIN branches b ON b.id = m.branch_id
      WHERE m.auth_id = $1 AND m.status = 'Active'`,
    [authUserId],
  )
  const memberRow = memberRes.rows[0]

  if (memberRow) {
    if (loginContext === "institution") {
      throw new AuthLoginError(LOGIN_ERROR_MESSAGES.useClientLogin)
    }
    if (loginContext === "client") {
      if (authRow.user_type !== AUTH_USER_TYPE_MEMBER) {
        throw new AuthLoginError(LOGIN_ERROR_MESSAGES.invalidClientAccountType)
      }
      if (memberRow.branch_status !== "Active") {
        throw new AuthLoginError(LOGIN_ERROR_MESSAGES.branchInactive)
      }
    }

    return {
      id: authUserId,
      authUserId,
      email,
      name: memberRow.full_name,
      role: "client",
      type: "client",
      memberId: memberRow.id,
      clientId: memberRow.id,
    }
  }

  return null
}

export async function authenticateCredentials(
  email: string,
  password: string,
  loginContext?: LoginContext,
): Promise<AppSessionUser | null> {
  return runWithoutAuth((client) => authenticateWithClient(client, email, password, loginContext))
}
