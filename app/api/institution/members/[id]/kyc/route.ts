import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

const ALLOWED = new Set(["passport_photo", "national_id_front", "national_id_back"])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  try {
    const { id: memberId } = await params
    const body = (await req.json()) as { docType?: string; url?: string }
    if (!body?.docType || !body?.url || !ALLOWED.has(body.docType)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "member.kyc.upload.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "member.kyc.upload.denied", { method: "POST", apiPath, status: 403, error: "forbidden" })
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    const column = body.docType

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const appUserRes = await client.query(
        `SELECT id, institution_id FROM users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const appUser = appUserRes.rows[0]
      if (!appUser) return { error: "forbidden" as const }

      const memberRes = await client.query(
        `SELECT id, institution_id FROM members WHERE id = $1 AND institution_id = $2`,
        [memberId, appUser.institution_id]
      )
      if (memberRes.rows.length === 0) return { error: "member_not_found" as const }

      await client.query(`UPDATE members SET ${column} = $1 WHERE id = $2 AND institution_id = $3`, [
        body.url,
        memberId,
        appUser.institution_id,
      ])
      return { ok: true }
    })

    if (result && "error" in result) {
      apiLog("warn", "member.kyc.upload.denied", { method: "POST", apiPath, status: result.error === "member_not_found" ? 404 : 403, error: result.error, memberId, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: result.error === "member_not_found" ? 404 : 403 })
    }
    apiLog("info", "member.kyc.upload.success", { method: "POST", apiPath, status: 200, memberId, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "member.kyc.upload.error", { method: "POST", apiPath, status: 400, error: err?.message || "Unknown error" })
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 400 })
  }
}
