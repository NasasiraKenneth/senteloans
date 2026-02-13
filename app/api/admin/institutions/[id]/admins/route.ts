import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"
import { hash } from "bcryptjs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const result = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `SELECT id, full_name, email, phone_number, status, role, supabase_user_id, created_at FROM senteloans_users WHERE institution_id = $1 AND role = 'institution_admin' ORDER BY created_at DESC`,
        [id]
      )
      return { admins: res.rows }
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: institutionId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { name?: string; email?: string; phone?: string; password?: string }
    const { name, email, phone, password } = body
    if (!name || !email || !password) return NextResponse.json({ error: "name, email and password are required" }, { status: 400 })
    const emailLower = String(email).trim().toLowerCase()

    const result = await runWithoutAuth(async (client) => {
      const existing = await client.query(`SELECT id FROM app_auth_users WHERE email = $1`, [emailLower])
      if (existing.rows.length > 0) return { error: "Auth email already exists" as const }

      const password_hash = await hash(password, 10)
      const authRes = await client.query(
        `INSERT INTO app_auth_users (email, password_hash) VALUES ($1, $2) RETURNING id`,
        [emailLower, password_hash]
      )
      const authUserId = authRes.rows[0]?.id
      if (!authUserId) return { error: "Failed to create auth user" as const }

      await client.query(
        `INSERT INTO senteloans_users (supabase_user_id, institution_id, email, full_name, phone_number, role, status) VALUES ($1, $2, $3, $4, $5, 'institution_admin', 'Active')`,
        [authUserId, institutionId, emailLower, String(name).trim(), phone ? String(phone).trim() : null]
      )
      return { ok: true, user_id: authUserId }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "Auth email already exists" ? 409 : 400 })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
