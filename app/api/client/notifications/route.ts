import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId)
      return NextResponse.json({ error: "client_not_found" }, { status: 404 })

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 100)
    const unreadOnly = url.searchParams.get("unread_only") === "true"

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      let query = `SELECT id, type, title, message, action_url, metadata, read, read_at, created_at
                   FROM senteloans_notifications
                   WHERE recipient_type = 'client' AND recipient_id = $1 ORDER BY created_at DESC LIMIT $2`
      const params: (string | number)[] = [session!.user!.clientId!, limit]
      if (unreadOnly) {
        query = `SELECT id, type, title, message, action_url, metadata, read, read_at, created_at
                 FROM senteloans_notifications
                 WHERE recipient_type = 'client' AND recipient_id = $1 AND read = false ORDER BY created_at DESC LIMIT $2`
      }
      const notifRes = await client.query(query, params)
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM senteloans_notifications WHERE recipient_type = 'client' AND recipient_id = $1 AND read = false`,
        [session!.user!.clientId!]
      )
      return { notifications: notifRes.rows, unreadCount: countRes.rows[0]?.c ?? 0 }
    })

    return NextResponse.json({
      ok: true,
      notifications: result?.notifications ?? [],
      unreadCount: result?.unreadCount ?? 0,
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
