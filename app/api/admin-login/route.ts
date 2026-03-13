import { NextResponse } from "next/server"
import { compare } from "bcryptjs"
import { runWithoutAuth } from "@/lib/db"

/**
 * POST /api/admin-login
 * Verifies credentials and that user is system_admin. Session is set by NextAuth when using signIn("credentials").
 * This endpoint can be used by legacy clients; the admin-login page uses NextAuth signIn directly.
 */
export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const result = await runWithoutAuth(async (client) => {
      const authRes = await client.query<{ id: string; password_hash: string }>(
        "SELECT id, password_hash FROM app_auth_users WHERE email = $1",
        [email.trim().toLowerCase()]
      )
      const authRow = authRes.rows[0]
      if (!authRow || !(await compare(password, authRow.password_hash))) return null

      const userRes = await client.query<{ id: string; role: string }>(
        `SELECT
           u.id,
           CASE
              WHEN r.name = 'System Admin' THEN 'system_admin'
              WHEN r.name = 'Super Admin' THEN 'super_admin'
             WHEN r.name = 'Admin' THEN 'institution_admin'
             WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
             ELSE NULL
           END AS role
         FROM senteloans_users u
         LEFT JOIN senteloans_roles r ON r.id = u.role_id
         WHERE u.supabase_user_id = $1 AND u.status = 'Active'`,
        [authRow.id]
      )
      const systemUser = userRes.rows[0]
      if (!systemUser) return { error: "User not provisioned" as const }
      if (systemUser.role !== "system_admin") return { error: "Not authorized" as const }
      return { ok: true }
    })

    if (result === null) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }
    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
