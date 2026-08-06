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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const update: Record<string, unknown> = {}

    const nameVal = typeof body.full_name === "string" ? body.full_name : typeof body.name === "string" ? body.name : undefined
    if (nameVal !== undefined) update.full_name = nameVal.trim()

    const phoneVal = typeof body.phone_number === "string" ? body.phone_number : typeof body.phone === "string" ? body.phone : undefined
    if (phoneVal !== undefined) update.phone_number = phoneVal.trim() || null

    const branchVal = typeof body.branch_id === "string" ? body.branch_id : typeof body.branchId === "string" ? body.branchId : undefined
    if (branchVal !== undefined) update.branch_id = branchVal

    if (typeof body.status === "string") update.status = body.status

    const emailVal = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined
    const usernameVal = typeof body.username === "string" ? body.username.trim() : undefined
    const newPassword = typeof body.new_password === "string" ? body.new_password : typeof body.password === "string" ? body.password : undefined

    if (Object.keys(update).length === 0 && !newPassword && !emailVal && !usernameVal) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    await runWithoutAuth(async (client) => {
      const adminRoleRes = await client.query(`SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`)
      const adminRoleId = adminRoleRes.rows[0]?.id
      if (!adminRoleId) throw new Error("Admin role is not seeded")

      if (emailVal !== undefined) update.email = emailVal

      if (Object.keys(update).length > 0) {
        const setClause = Object.keys(update).map((k, i) => `${k} = $${i + 4}`).join(", ")
        await client.query(
          `UPDATE users SET ${setClause} WHERE id = $1 AND institution_id = $2 AND role_id = $3`,
          [userId, institutionId, adminRoleId, ...Object.values(update)]
        )
      }

      if (newPassword || emailVal || usernameVal) {
        const appUserRes = await client.query(
          `SELECT auth_id FROM users WHERE id = $1 AND institution_id = $2 AND role_id = $3`,
          [userId, institutionId, adminRoleId]
        )
        const authUserId = appUserRes.rows[0]?.auth_id
        if (authUserId) {
          const authUpdates: string[] = []
          const authValues: any[] = []
          let paramIdx = 1

          if (emailVal) {
            authUpdates.push(`email = $${paramIdx++}`)
            authValues.push(emailVal)
          }
          if (usernameVal) {
            authUpdates.push(`username = $${paramIdx++}`)
            authValues.push(usernameVal)
          }
          if (newPassword && newPassword.length >= 6) {
            const password_hash = await hash(newPassword, 10)
            authUpdates.push(`password_hash = $${paramIdx++}`)
            authValues.push(password_hash)
          }

          if (authUpdates.length > 0) {
            authUpdates.push(`updated_at = NOW()`)
            authValues.push(authUserId)
            await client.query(
              `UPDATE app_auth_users SET ${authUpdates.join(", ")} WHERE id = $${paramIdx}`,
              authValues
            )
          }
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
      const adminRoleRes = await client.query(`SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`)
      const adminRoleId = adminRoleRes.rows[0]?.id
      if (!adminRoleId) throw new Error("Admin role is not seeded")

      const appUserRes = await client.query(
        `SELECT id, auth_id FROM users WHERE id = $1 AND institution_id = $2 AND role_id = $3`,
        [userId, institutionId, adminRoleId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) {
        throw new Error("User not found")
      }
      await client.query(`UPDATE audit_logs SET user_id = NULL WHERE user_id = $1`, [userId])
      await client.query(`DELETE FROM users WHERE id = $1 AND institution_id = $2`, [userId, institutionId])
      if (appUser.auth_id) {
        await client.query(`DELETE FROM app_auth_users WHERE id = $1`, [appUser.auth_id])
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
