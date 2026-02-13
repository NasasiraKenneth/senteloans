import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { compare, hash } from "bcryptjs"
import { runWithoutAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const payload = await req.json().catch(() => ({})) as { currentPassword?: string; newPassword?: string }
    const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : ""
    const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : ""

    const errors: string[] = []
    if (!currentPassword) errors.push("current_password_required")
    if (!newPassword) errors.push("new_password_required")
    if (newPassword && newPassword.length < 8) errors.push("new_password_too_short")
    if (errors.length > 0) return NextResponse.json({ error: errors.join(",") }, { status: 400 })

    const ok = await runWithoutAuth(async (client) => {
      const res = await client.query<{ password_hash: string }>(
        `SELECT password_hash FROM app_auth_users WHERE id = $1`,
        [session!.user!.authUserId]
      )
      const row = res.rows[0]
      if (!row || !(await compare(currentPassword, row.password_hash))) return false
      const password_hash = await hash(newPassword, 10)
      await client.query(`UPDATE app_auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
        password_hash,
        session!.user!.authUserId,
      ])
      return true
    })

    if (!ok) return NextResponse.json({ error: "invalid_current_password" }, { status: 400 })

    if (session.user.clientId && session.user.institutionId) {
      await auditLogger
        .logUpdate(
          "app_auth_users",
          session.user.authUserId,
          {},
          { password_changed: true },
          session.user.institutionId,
          undefined
        )
        .catch(() => null)
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
