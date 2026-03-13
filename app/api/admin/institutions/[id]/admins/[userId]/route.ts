import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"
import { hash } from "bcryptjs"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id: institutionId, userId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const update: Record<string, unknown> = {}
    if (typeof body.full_name === "string") update.full_name = body.full_name
    if (typeof body.phone_number === "string") update.phone_number = body.phone_number
    if (typeof body.status === "string") update.status = body.status
    const newPassword = typeof body.new_password === "string" ? body.new_password : undefined

    if (Object.keys(update).length === 0 && !newPassword) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    await runWithoutAuth(async (client) => {
      const adminRoleRes = await client.query(`SELECT id FROM senteloans_roles WHERE name = 'Admin' LIMIT 1`)
      const adminRoleId = adminRoleRes.rows[0]?.id
      if (!adminRoleId) throw new Error("Admin role is not seeded")

      if (Object.keys(update).length > 0) {
        const setClause = Object.keys(update).map((k, i) => `${k} = $${i + 4}`).join(", ")
        await client.query(
          `UPDATE senteloans_users SET ${setClause} WHERE id = $1 AND institution_id = $2 AND role_id = $3`,
          [userId, institutionId, adminRoleId, ...Object.values(update)]
        )
      }
      if (newPassword && newPassword.length >= 8) {
        const appUserRes = await client.query(
          `SELECT supabase_user_id FROM senteloans_users WHERE id = $1 AND institution_id = $2 AND role_id = $3`,
          [userId, institutionId, adminRoleId]
        )
        const authUserId = appUserRes.rows[0]?.supabase_user_id
        if (authUserId) {
          const password_hash = await hash(newPassword, 10)
          await client.query(`UPDATE app_auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [password_hash, authUserId])
        }
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id: institutionId, userId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await runWithoutAuth(async (client) => {
      const adminRoleRes = await client.query(`SELECT id FROM senteloans_roles WHERE name = 'Admin' LIMIT 1`)
      const adminRoleId = adminRoleRes.rows[0]?.id
      if (!adminRoleId) throw new Error("Admin role is not seeded")

      const appUserRes = await client.query(
        `SELECT id, supabase_user_id FROM senteloans_users WHERE id = $1 AND institution_id = $2 AND role_id = $3`,
        [userId, institutionId, adminRoleId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) {
        throw new Error("User not found")
      }
      await client.query(`UPDATE senteloans_audit_logs SET user_id = NULL WHERE user_id = $1`, [userId])
      await client.query(`DELETE FROM senteloans_users WHERE id = $1 AND institution_id = $2`, [userId, institutionId])
      if (appUser.supabase_user_id) {
        await client.query(`DELETE FROM app_auth_users WHERE id = $1`, [appUser.supabase_user_id])
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
