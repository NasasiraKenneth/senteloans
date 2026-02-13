import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

const ALLOWED = new Set(["passport_photo", "national_id_front", "national_id_back"])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params
    const body = (await req.json()) as { docType?: string; url?: string }
    if (!body?.docType || !body?.url || !ALLOWED.has(body.docType)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const column = body.docType

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "forbidden" as const }

      const clientRes = await client.query(
        `SELECT id, institution_id FROM senteloans_clients WHERE id = $1 AND institution_id = $2`,
        [clientId, appUser.institution_id]
      )
      if (clientRes.rows.length === 0) return { error: "client_not_found" as const }

      await client.query(`UPDATE senteloans_clients SET ${column} = $1 WHERE id = $2 AND institution_id = $3`, [
        body.url,
        clientId,
        appUser.institution_id,
      ])
      return { ok: true }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "client_not_found" ? 404 : 403 })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 400 })
  }
}
