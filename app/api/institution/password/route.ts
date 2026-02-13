import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { compare, hash } from "bcryptjs"
import { runWithoutAuth } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await req.json()) as { currentPassword?: string; newPassword?: string; confirmPassword?: string }
    const currentPassword = (body?.currentPassword || "").trim()
    const newPassword = (body?.newPassword || "").trim()
    const confirmPassword = (body?.confirmPassword || "").trim()

    if (!currentPassword) return NextResponse.json({ error: "current_password_required" }, { status: 400 })
    if (!newPassword || newPassword.length < 8) return NextResponse.json({ error: "password_too_short" }, { status: 400 })
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "password_mismatch" }, { status: 400 })

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
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
