import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

/**
 * GET /api/admin/users
 * Returns all staff users (users) with institution name, for system admin.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const roleParam = searchParams.get("role")
    const systemOnly = searchParams.get("system_only") === "true" || roleParam === "system_admin"

    const rows = await runWithoutAuth(async (client) => {
      let query = ""
      const values: unknown[] = []

      if (systemOnly) {
        // Query system_admin accounts specifically across app_auth_users and users
        query = `
          SELECT DISTINCT ON (COALESCE(u.id, a.id))
                 COALESCE(u.id, a.id) AS id,
                 COALESCE(u.full_name, a.username, 'System Administrator') AS full_name,
                 a.username,
                 COALESCE(u.email, a.email) AS email,
                 u.phone_number,
                 COALESCE(u.status, 'Active') AS status,
                 COALESCE(u.created_at, a.created_at) AS created_at,
                 'system_admin' AS role,
                 COALESCE(i.name, 'SenteLoans System') AS institution_name,
                 i.id AS institution_id
          FROM app_auth_users a
          LEFT JOIN users u ON u.auth_id = a.id OR LOWER(u.email) = LOWER(a.email)
          LEFT JOIN institutions i ON i.id = u.institution_id
          LEFT JOIN roles r ON r.id = u.role_id
          WHERE a.user_type = 'system_admin' OR r.name = 'System Admin' OR LOWER(COALESCE(r.name, '')) LIKE '%system%admin%'
          ORDER BY COALESCE(u.id, a.id), COALESCE(u.created_at, a.created_at) DESC
        `
      } else {
        query = `
          SELECT u.id, u.full_name, a.username, u.email, u.phone_number, u.status, u.created_at,
                 CASE
                   WHEN a.user_type = 'system_admin' THEN 'system_admin'
                   WHEN r.name = 'System Admin' THEN 'system_admin'
                   WHEN r.name = 'Super Admin' THEN 'super_admin'
                   WHEN r.name = 'Admin' THEN 'institution_admin'
                   WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
                   ELSE 'staff'
                 END AS role,
                 COALESCE(i.name, 'SenteLoans System') AS institution_name,
                 i.id AS institution_id
          FROM users u
          LEFT JOIN institutions i ON i.id = u.institution_id
          LEFT JOIN app_auth_users a ON a.id = u.auth_id
          LEFT JOIN roles r ON r.id = u.role_id
          ORDER BY role, u.full_name
        `
      }

      const res = await client.query(query, values)
      return res.rows
    })

    return NextResponse.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        fullName: r.full_name,
        username: r.username || (r.email ? String(r.email).split("@")[0] : ""),
        email: r.email,
        phoneNumber: r.phone_number,
        role: r.role,
        status: r.status,
        createdAt: r.created_at,
        institutionName: r.institution_name,
        institutionId: r.institution_id,
      }))
    )
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * POST /api/admin/users
 * Creates a new system_admin user.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { fullName, email, username, password, phoneNumber } = body

    if (!fullName || !email || !password) {
      return NextResponse.json({ error: "Full Name, Email, and Password are required" }, { status: 400 })
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const cleanUsername = username ? String(username).trim() : cleanEmail.split("@")[0]
    const { hash } = await import("bcryptjs")
    const passwordHash = await hash(password, 10)
    const authId = crypto.randomUUID()
    const userId = crypto.randomUUID()

    await runWithoutAuth(async (client) => {
      // 1. Insert or update app_auth_users
      await client.query(
        `INSERT INTO app_auth_users (id, user_type, username, email, password_hash)
         VALUES ($1, 'system_admin', $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
         SET user_type = 'system_admin', username = EXCLUDED.username, password_hash = $4`,
        [authId, cleanUsername, cleanEmail, passwordHash]
      )

      // Get auth ID (in case conflict update occurred)
      const authRes = await client.query(`SELECT id FROM app_auth_users WHERE email = $1`, [cleanEmail])
      const finalAuthId = authRes.rows[0]?.id || authId

      // 2. Insert or update users record
      await client.query(
        `INSERT INTO users (id, auth_id, full_name, email, phone_number, status)
         VALUES ($1, $2, $3, $4, $5, 'Active')
         ON CONFLICT (email) DO UPDATE
         SET full_name = EXCLUDED.full_name, auth_id = EXCLUDED.auth_id, phone_number = EXCLUDED.phone_number, status = 'Active'`,
        [userId, finalAuthId, fullName, cleanEmail, phoneNumber || null]
      )
    })

    return NextResponse.json({ success: true, message: "System administrator created successfully" })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Failed to create system admin" }, { status: 500 })
  }
}

/**
 * PUT /api/admin/users
 * Updates an existing system_admin user account.
 */
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { id, fullName, email, username, phoneNumber, status, password } = body

    if (!id || !fullName || !email) {
      return NextResponse.json({ error: "User ID, Full Name, and Email are required" }, { status: 400 })
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const cleanUsername = username ? String(username).trim() : cleanEmail.split("@")[0]

    await runWithoutAuth(async (client) => {
      // 1. Update users table if matching ID or email exists
      const userRes = await client.query(
        `UPDATE users
         SET full_name = $1, email = $2, phone_number = $3, status = $4
         WHERE id = $5 OR auth_id = $5 OR LOWER(email) = LOWER($2)
         RETURNING auth_id`,
        [fullName, cleanEmail, phoneNumber || null, status || "Active", id]
      )

      const authId = userRes.rows[0]?.auth_id || id

      // 2. Update app_auth_users table
      if (password) {
        const { hash } = await import("bcryptjs")
        const passwordHash = await hash(password, 10)
        await client.query(
          `UPDATE app_auth_users
           SET email = $1, username = $2, password_hash = $3
           WHERE id = $4 OR LOWER(email) = LOWER($1)`,
          [cleanEmail, cleanUsername, passwordHash, authId]
        )
      } else {
        await client.query(
          `UPDATE app_auth_users
           SET email = $1, username = $2
           WHERE id = $3 OR LOWER(email) = LOWER($1)`,
          [cleanEmail, cleanUsername, authId]
        )
      }
    })

    return NextResponse.json({ success: true, message: "System administrator updated successfully" })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Failed to update system admin" }, { status: 500 })
  }
}
