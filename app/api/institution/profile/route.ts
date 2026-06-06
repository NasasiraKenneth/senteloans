import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const row = await runWithAuth(session.user.authUserId, async (client) => {
      const res = await client.query(
        `SELECT id, email, full_name, phone_number, role, institution_id
         FROM users
         WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      return res.rows[0]
    })

    if (!row) return NextResponse.json({ error: "no_app_user" }, { status: 404 })

    return NextResponse.json({
      id: row.id,
      email: row.email,
      name: row.full_name,
      phone: row.phone_number,
      role: row.role,
      institutionId: row.institution_id,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = (await req.json()) as { name?: string; phone?: string }
    const updates: string[] = []
    const values: (string | null)[] = []
    let i = 1
    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      updates.push(`full_name = $${i++}`)
      values.push(body.name.trim())
    }
    if (typeof body.phone === "string") {
      updates.push(`phone_number = $${i++}`)
      values.push(body.phone.trim())
    }
    if (updates.length === 0) return NextResponse.json({ error: "no_changes" }, { status: 400 })

    values.push(session.user.authUserId)
    await runWithAuth(session.user.authUserId, async (client) => {
      await client.query(
        `UPDATE users SET ${updates.join(", ")} WHERE supabase_user_id = $${i}`,
        values
      )
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 })
  }
}
