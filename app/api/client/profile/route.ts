import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "client" || !session.user.clientId) return NextResponse.json({ error: "client_only" }, { status: 403 })

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>
    const village = typeof payload.village === "string" ? payload.village.trim() : undefined
    const district = typeof payload.district === "string" ? payload.district.trim() : undefined
    const occupation = typeof payload.occupation === "string" ? payload.occupation.trim() : undefined
    const nextOfKinName = typeof payload.nextOfKinName === "string" ? payload.nextOfKinName.trim() : undefined
    const nextOfKinRelationship = typeof payload.nextOfKinRelationship === "string" ? payload.nextOfKinRelationship.trim() : undefined
    const nextOfKinPhone = typeof payload.nextOfKinPhone === "string" ? payload.nextOfKinPhone.trim() : undefined

    const errors: string[] = []
    const onlyDigitsPlus = (s: string) => /^\+?[0-9]{7,15}$/.test(s)
    if ((village && village.length > 500) || (district && district.length > 500)) errors.push("location_too_long")
    if (occupation && occupation.length > 500) errors.push("occupation_too_long")
    if (nextOfKinName && nextOfKinName.length > 255) errors.push("next_of_kin_name_too_long")
    if (nextOfKinRelationship && nextOfKinRelationship.length > 500) errors.push("next_of_kin_relationship_too_long")
    if (nextOfKinPhone && !onlyDigitsPlus(nextOfKinPhone)) errors.push("invalid_next_of_kin_phone")
    if (errors.length > 0) return NextResponse.json({ error: errors.join(",") }, { status: 400 })

    const updates: Record<string, string | null> = {}
    if (typeof village !== "undefined") updates.village = village ?? null
    if (typeof district !== "undefined") updates.district = district ?? null
    if (typeof occupation !== "undefined") updates.occupation = occupation ?? null
    if (typeof nextOfKinName !== "undefined") updates.next_of_kin_name = nextOfKinName ?? null
    if (typeof nextOfKinRelationship !== "undefined") updates.next_of_kin_relationship = nextOfKinRelationship ?? null
    if (typeof nextOfKinPhone !== "undefined") updates.next_of_kin_phone = nextOfKinPhone ?? null
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true, updated: false })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const clientRes = await client.query(
        `SELECT id, institution_id, village, district, occupation, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone FROM senteloans_clients WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const row = clientRes.rows[0]
      if (!row) return null

      const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ")
      await client.query(`UPDATE senteloans_clients SET ${setClause} WHERE id = $1`, [row.id, ...Object.values(updates)])

      const oldValues = {
        village: row.village,
        district: row.district,
        occupation: row.occupation,
        next_of_kin_name: row.next_of_kin_name,
        next_of_kin_relationship: row.next_of_kin_relationship,
        next_of_kin_phone: row.next_of_kin_phone,
      }
      await auditLogger.logUpdate("senteloans_clients", row.id, oldValues, updates, row.institution_id, undefined, undefined, client)

      const selRes = await client.query(
        `SELECT id, village, district, occupation, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone FROM senteloans_clients WHERE id = $1`,
        [row.id]
      )
      return { ok: true, updated: true, profile: selRes.rows[0] }
    })

    if (!result) return NextResponse.json({ error: "client_not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
