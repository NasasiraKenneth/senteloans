import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200)
    const unreadOnly = url.searchParams.get("unread_only") === "true"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const userRes = await client.query(
        `SELECT id, institution_id FROM users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const instUser = userRes.rows[0]
      if (!instUser) return { ok: true, notifications: [], unreadCount: 0 }

      let where = `recipient_type = 'institution_user' AND recipient_id = $1`
      const params: unknown[] = [instUser.id]
      if (unreadOnly) {
        where += ` AND read = false`
      }
      params.push(limit)
      const listRes = await client.query(
        `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT $2`,
        params
      )
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM notifications WHERE recipient_type = 'institution_user' AND recipient_id = $1 AND read = false`,
        [instUser.id]
      )
      const unreadCount = countRes.rows[0]?.c ?? 0
      return { ok: true, notifications: listRes.rows, unreadCount }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
