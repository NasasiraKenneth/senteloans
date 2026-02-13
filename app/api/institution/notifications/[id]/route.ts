import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: notificationId } = await params
    if (!notificationId) return NextResponse.json({ error: "missing_notification_id" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { read?: boolean }
    const read = body.read !== undefined ? body.read : true
    const read_at = read !== false ? new Date().toISOString() : null

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const userRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const instUser = userRes.rows[0]
      if (!instUser) return { error: "user_not_found" as const }

      const updateRes = await client.query(
        `UPDATE senteloans_notifications SET read = $1, read_at = $2 WHERE id = $3 AND recipient_type = 'institution_user' AND recipient_id = $4`,
        [read, read_at, notificationId, instUser.id]
      )
      if (updateRes.rowCount === 0) return { error: "not_found" as const }
      return { ok: true }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 404 })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
