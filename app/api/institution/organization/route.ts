import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const row = await runWithAuth(session.user.authUserId, async (client) => {
      const userRes = await client.query(
        `SELECT u.institution_id, i.id AS inst_id, i.name, i.type,
                i.license_number, i.registration_number, i.website, i.logo
         FROM senteloans_users u
         JOIN senteloans_institutions i ON i.id = u.institution_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      return userRes.rows[0]
    })

    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

    return NextResponse.json({
      id: row.inst_id,
      name: row.name,
      type: row.type,
      license_number: row.license_number || "",
      registration_number: row.registration_number || "",
      website: row.website || "",
      logo: row.logo || "",
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

function isValidUrl(url: string) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = (await req.json()) as Record<string, unknown>
    const {
      license_number,
      registration_number,
      website,
      logo,
    } = body || {}

    if (typeof website === "string" && website && !isValidUrl(website)) {
      return NextResponse.json({ error: "invalid_website" }, { status: 400 })
    }
    if (typeof logo === "string" && logo && !isValidUrl(logo)) {
      return NextResponse.json({ error: "invalid_logo" }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let i = 1
    if (license_number !== undefined) {
      updates.push(`license_number = $${i++}`)
      values.push(license_number)
    }
    if (registration_number !== undefined) {
      updates.push(`registration_number = $${i++}`)
      values.push(registration_number)
    }
    if (website !== undefined) {
      updates.push(`website = $${i++}`)
      values.push(website)
    }
    if (logo !== undefined) {
      updates.push(`logo = $${i++}`)
      values.push(logo)
    }
    if (updates.length === 0) return NextResponse.json({ error: "no_changes" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const meRes = await client.query(
        `SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const me = meRes.rows[0]
      if (!me) return null
      values.push(me.institution_id)
      await client.query(
        `UPDATE senteloans_institutions SET ${updates.join(", ")} WHERE id = $${i}`,
        values
      )
      const instRes = await client.query(
        `SELECT id, name, type, license_number, registration_number, website, logo
         FROM senteloans_institutions WHERE id = $1`,
        [me.institution_id]
      )
      return instRes.rows[0]
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
