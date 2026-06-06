import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { notificationService } from "@/lib/notifications/notification-service"

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const userRes = await client.query(
        `SELECT id FROM users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const instUser = userRes.rows[0]
      if (!instUser) return { error: "user_not_found" as const }

      return notificationService.markAllAsRead(instUser.id, "institution_user", client)
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
