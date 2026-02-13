import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import { auditLogger } from "@/lib/audit/audit-logger"

function isElevated(role?: string | null) {
  return role === "institution_admin" || role === "manager"
}

const VALID_ROLES = ["institution_admin", "manager", "loan_officer", "teller"]
const VALID_STATUSES = ["Active", "Inactive", "Suspended"]

/** GET /api/institution/staff/[id] — fetch a single staff member */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing staff ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

      const res = await client.query(
        `SELECT u.id, u.full_name, u.email, u.phone_number, u.role, u.status,
                u.is_admin, u.joined_at, u.permissions, u.last_login, u.created_at,
                a.username
         FROM senteloans_users u
         LEFT JOIN app_auth_users a ON a.id = u.supabase_user_id
         WHERE u.id = $1 AND u.institution_id = $2`,
        [id, actor.institution_id]
      )
      if (res.rows.length === 0) return { error: "staff_not_found" as const }
      return { staff: res.rows[0] }
    })

    if (result && "error" in result) {
      const status = result.error === "staff_not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/** PUT /api/institution/staff/[id] — update a staff member */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing staff ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!isElevated(session.user.role))
      return NextResponse.json({ error: "Only admins and managers can edit staff" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const firstName = String(body.firstName || "").trim()
    const lastName = String(body.lastName || "").trim()
    const email = String(body.email || "").trim().toLowerCase()
    const phoneNumber = String(body.phoneNumber || "").trim()
    const username = String(body.username || "").trim().toLowerCase()
    const password = String(body.password || "").trim()
    const status = String(body.status || "Active").trim()
    const joinDate = String(body.joinDate || "").trim()
    const isAdministrator = Boolean(body.isAdministrator)
    const roles: string[] = Array.isArray(body.roles) ? body.roles : []

    // Validation
    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 })
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 })
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })
    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 })
    if (roles.length === 0) return NextResponse.json({ error: "At least one role is required" }, { status: 400 })

    const primaryRole = roles[0]
    if (!VALID_ROLES.includes(primaryRole))
      return NextResponse.json({ error: `Invalid role: ${primaryRole}` }, { status: 400 })
    if (!VALID_STATUSES.includes(status))
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })

    const fullName = `${firstName} ${lastName}`

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      // Get actor
      const actorRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

      // Get existing staff member
      const staffRes = await client.query(
        `SELECT u.id, u.email, u.supabase_user_id, u.full_name, u.role, u.status, u.is_admin
         FROM senteloans_users u
         WHERE u.id = $1 AND u.institution_id = $2`,
        [id, actor.institution_id]
      )
      if (staffRes.rows.length === 0) return { error: "staff_not_found" as const }
      const existing = staffRes.rows[0]

      // Check email uniqueness (exclude self)
      if (email !== existing.email) {
        const emailCheck = await client.query(
          `SELECT id FROM senteloans_users WHERE email = $1 AND id != $2`,
          [email, id]
        )
        if (emailCheck.rows.length > 0) return { error: "email_already_exists" as const }
      }

      // Check username uniqueness in app_auth_users (exclude self)
      if (existing.supabase_user_id) {
        const usernameCheck = await client.query(
          `SELECT id FROM app_auth_users WHERE (username = $1 OR email = $2) AND id != $3`,
          [username, email, existing.supabase_user_id]
        )
        if (usernameCheck.rows.length > 0) return { error: "username_or_auth_email_already_exists" as const }
      }

      // Build permissions
      const permissions = buildPermissions(roles, isAdministrator)

      // Store old values for audit
      const oldValues = {
        full_name: existing.full_name,
        email: existing.email,
        role: existing.role,
        status: existing.status,
        is_admin: existing.is_admin,
      }

      // 1. Update senteloans_users
      await client.query(
        `UPDATE senteloans_users
         SET full_name = $1, email = $2, phone_number = $3, role = $4,
             permissions = $5, status = $6, is_admin = $7, joined_at = $8, updated_at = NOW()
         WHERE id = $9`,
        [fullName, email, phoneNumber || null, primaryRole, JSON.stringify(permissions), status, isAdministrator, joinDate || null, id]
      )

      // 2. Update app_auth_users (email, username, and optionally password)
      if (existing.supabase_user_id) {
        if (password && password.length >= 8) {
          const passwordHash = await hash(password, 10)
          await client.query(
            `UPDATE app_auth_users SET email = $1, username = $2, password_hash = $3, updated_at = NOW() WHERE id = $4`,
            [email, username, passwordHash, existing.supabase_user_id]
          )
        } else {
          await client.query(
            `UPDATE app_auth_users SET email = $1, username = $2, updated_at = NOW() WHERE id = $3`,
            [email, username, existing.supabase_user_id]
          )
        }
      }

      // 3. Audit log
      await auditLogger.logUpdate(
        "senteloans_users",
        id,
        oldValues,
        { full_name: fullName, email, role: primaryRole, status, is_admin: isAdministrator },
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
          role: primaryRole,
          status,
          is_admin: isAdministrator,
          joined_at: joinDate || null,
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "staff_not_found" ? 404 :
        result.error === "email_already_exists" ? 409 :
        result.error === "username_or_auth_email_already_exists" ? 409 :
        result.error === "user_not_linked" ? 400 : 500
      const message =
        result.error === "email_already_exists" ? "A staff member with this email already exists" :
        result.error === "username_or_auth_email_already_exists" ? "Username or email is already taken" :
        result.error === "staff_not_found" ? "Staff member not found" :
        result.error
      return NextResponse.json({ error: message }, { status: statusCode })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

function buildPermissions(roles: string[], isAdmin: boolean): Record<string, Record<string, boolean>> {
  if (isAdmin || roles.includes("institution_admin")) {
    return {
      clients: { create: true, read: true, update: true, delete: true },
      loans: { create: true, read: true, update: true, delete: true, approve: true, disburse: true },
      savings: { create: true, read: true, update: true, delete: true },
      transactions: { create: true, read: true, update: true, delete: true },
      reports: { create: true, read: true, update: true, delete: true },
      users: { create: true, read: true, update: true, delete: true },
      settings: { create: true, read: true, update: true, delete: true },
    }
  }

  const perms: Record<string, Record<string, boolean>> = {
    clients: { create: false, read: true, update: false, delete: false },
    loans: { create: false, read: true, update: false, delete: false, approve: false, disburse: false },
    savings: { create: false, read: true, update: false, delete: false },
    transactions: { create: false, read: true, update: false, delete: false },
    reports: { create: false, read: false, update: false, delete: false },
  }

  for (const role of roles) {
    if (role === "manager") {
      perms.clients = { create: true, read: true, update: true, delete: false }
      perms.loans = { create: true, read: true, update: true, delete: false, approve: true, disburse: true }
      perms.transactions = { create: true, read: true, update: true, delete: false }
      perms.reports = { create: true, read: true, update: false, delete: false }
      perms.users = { create: false, read: true, update: false, delete: false }
    }
    if (role === "loan_officer") {
      perms.clients.create = true
      perms.clients.update = true
      perms.loans.create = true
      perms.loans.update = true
      perms.savings = { create: true, read: true, update: true, delete: false }
      perms.transactions.create = true
      perms.reports.read = true
    }
    if (role === "teller") {
      perms.transactions.create = true
      perms.reports.read = false
    }
  }

  return perms
}
