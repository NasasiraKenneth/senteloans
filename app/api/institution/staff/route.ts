import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { hash } from "bcryptjs"
import * as crypto from "crypto"
import { auditLogger } from "@/lib/audit/audit-logger"

function isElevated(role?: string | null) {
  return role === "institution_admin" || role === "manager"
}

const VALID_ROLES = ["institution_admin", "manager", "loan_officer", "teller"]
const VALID_STATUSES = ["Active", "Inactive", "Suspended"]

export async function GET(req: Request) {
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
    const pageSize = Math.min(
      parseInt(searchParams.get("limit") || "50", 10) || 50,
      200
    )

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        let where =
          "u.institution_id = (SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1)"
        // Exclude system_admin and client roles — only institution staff
        where += " AND u.role NOT IN ('system_admin', 'client')"
        const params: unknown[] = [session!.user!.authUserId]
        let idx = 2

        if (search) {
          where += ` AND (u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone_number ILIKE $${idx})`
          params.push(`%${search}%`)
          idx++
        }
        if (role) {
          where += ` AND u.role = $${idx}`
          params.push(role)
          idx++
        }
        if (status) {
          where += ` AND u.status = $${idx}`
          params.push(status)
          idx++
        }

        params.push(pageSize)
        const res = await client.query(
          `SELECT u.id, u.full_name, u.email, u.phone_number, u.role, u.status,
                  u.is_admin, u.joined_at, u.last_login, u.created_at
           FROM senteloans_users u
           WHERE ${where}
           ORDER BY u.created_at DESC
           LIMIT $${idx}`,
          params
        )
        return res.rows
      }
    )

    return NextResponse.json({ staff: result || [] })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!isElevated(session.user.role))
      return NextResponse.json({ error: "Only admins and managers can create staff" }, { status: 403 })

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
    if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    if (roles.length === 0) return NextResponse.json({ error: "At least one role is required" }, { status: 400 })

    // Use the first role as the primary role (DB column is single enum)
    const primaryRole = roles[0]
    if (!VALID_ROLES.includes(primaryRole))
      return NextResponse.json({ error: `Invalid role: ${primaryRole}` }, { status: 400 })
    if (!VALID_STATUSES.includes(status))
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })

    const fullName = `${firstName} ${lastName}`

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      // Get actor's institution
      const actorRes = await client.query(
        `SELECT id, institution_id, role FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

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

      // 2. Build permissions based on roles
      const permissions = buildPermissions(roles, isAdministrator)

      // 3. Create senteloans_users record
      const userId = crypto.randomUUID()
      await client.query(
        `INSERT INTO senteloans_users (
          id, supabase_user_id, institution_id, email, full_name, phone_number,
          role, permissions, status, is_admin, joined_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          authId,
          actor.institution_id,
          email,
          fullName,
          phoneNumber || null,
          primaryRole,
          JSON.stringify(permissions),
          status,
          isAdministrator,
          joinDate || null,
        ]
      )

      // 4. Audit log
      await auditLogger.logInsert(
        "senteloans_users",
        userId,
        { email, full_name: fullName, role: primaryRole, status, is_admin: isAdministrator },
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
          role: primaryRole,
          status,
          is_admin: isAdministrator,
          joined_at: joinDate || null,
          created_at: new Date().toISOString(),
        },
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "email_already_exists" ? 409 :
        result.error === "username_or_auth_email_already_exists" ? 409 :
        result.error === "user_not_linked" ? 400 : 500
      const message =
        result.error === "email_already_exists" ? "A staff member with this email already exists" :
        result.error === "username_or_auth_email_already_exists" ? "Username or email is already taken" :
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

function buildPermissions(roles: string[], isAdmin: boolean): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {}

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

  // Start with minimal permissions
  perms.clients = { create: false, read: true, update: false, delete: false }
  perms.loans = { create: false, read: true, update: false, delete: false, approve: false, disburse: false }
  perms.savings = { create: false, read: true, update: false, delete: false }
  perms.transactions = { create: false, read: true, update: false, delete: false }
  perms.reports = { create: false, read: false, update: false, delete: false }

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
